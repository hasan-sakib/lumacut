"""S3-compatible object storage: client factory, key layout, presigning."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

import structlog
from aiobotocore.config import AioConfig
from aiobotocore.session import get_session
from botocore.exceptions import ClientError

from lumacut_core.settings import CoreSettings

if TYPE_CHECKING:
    # Type stubs are a dev-only dependency; never import them at runtime.
    from types_aiobotocore_s3 import S3Client
    from types_aiobotocore_s3.type_defs import CompletedPartTypeDef, ObjectIdentifierTypeDef

log = structlog.get_logger()

PRESIGN_TTL_S = 3600
MULTIPART_THRESHOLD = 64 * 1024 * 1024
MULTIPART_PART_SIZE = 64 * 1024 * 1024


@asynccontextmanager
async def open_s3(settings: CoreSettings, *, public: bool = False) -> AsyncIterator[S3Client]:
    """S3 client. `public=True` targets the browser-facing endpoint, for presigning only."""
    endpoint = settings.s3_public_endpoint_url if public else settings.s3_endpoint_url
    async with get_session().create_client(
        "s3",
        endpoint_url=endpoint,
        region_name=settings.s3_region,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        config=AioConfig(signature_version="s3v4", s3={"addressing_style": "path"}),
    ) as client:
        yield client


async def ensure_bucket(s3: S3Client, bucket: str) -> None:
    """Create the bucket if it does not exist yet (idempotent)."""
    try:
        await s3.head_bucket(Bucket=bucket)
    except ClientError:
        await s3.create_bucket(Bucket=bucket)
        log.info("storage.bucket_created", bucket=bucket)


@dataclass(frozen=True)
class AssetKeys:
    """Object key layout for one asset: users/{owner}/assets/{asset}/..."""

    owner_id: str
    asset_id: str

    @property
    def prefix(self) -> str:
        return f"users/{self.owner_id}/assets/{self.asset_id}/"

    def original(self, extension: str) -> str:
        ext = extension.lower().lstrip(".")
        return f"{self.prefix}original" + (f".{ext}" if ext else "")

    def rendition(self, name: str) -> str:
        return f"{self.prefix}{name}"


async def presign_get(s3: S3Client, bucket: str, key: str, ttl_s: int = PRESIGN_TTL_S) -> str:
    return await s3.generate_presigned_url(
        "get_object", Params={"Bucket": bucket, "Key": key}, ExpiresIn=ttl_s
    )


async def presign_upload_part(
    s3: S3Client,
    bucket: str,
    key: str,
    upload_id: str,
    part_number: int,
    ttl_s: int = PRESIGN_TTL_S,
) -> str:
    return await s3.generate_presigned_url(
        "upload_part",
        Params={"Bucket": bucket, "Key": key, "UploadId": upload_id, "PartNumber": part_number},
        ExpiresIn=ttl_s,
    )


async def upload_file(s3: S3Client, bucket: str, key: str, path: Path, content_type: str) -> None:
    """Stream a local file to storage; multipart above 64 MiB so memory stays bounded and files
    can exceed the 5 GB single-PUT limit. Disk reads run in a thread (never block the loop)."""
    size = (await asyncio.to_thread(path.stat)).st_size
    if size <= MULTIPART_THRESHOLD:
        body = await asyncio.to_thread(path.read_bytes)
        await s3.put_object(Bucket=bucket, Key=key, Body=body, ContentType=content_type)
        return
    created = await s3.create_multipart_upload(Bucket=bucket, Key=key, ContentType=content_type)
    upload_id = created["UploadId"]
    try:
        parts: list[CompletedPartTypeDef] = []
        f = await asyncio.to_thread(path.open, "rb")
        try:
            number = 1
            while chunk := await asyncio.to_thread(f.read, MULTIPART_PART_SIZE):
                res = await s3.upload_part(
                    Bucket=bucket, Key=key, UploadId=upload_id, PartNumber=number, Body=chunk
                )
                parts.append({"PartNumber": number, "ETag": res["ETag"]})
                number += 1
        finally:
            await asyncio.to_thread(f.close)
        await s3.complete_multipart_upload(
            Bucket=bucket, Key=key, UploadId=upload_id, MultipartUpload={"Parts": parts}
        )
    except BaseException:
        await s3.abort_multipart_upload(Bucket=bucket, Key=key, UploadId=upload_id)
        raise


async def delete_prefix(s3: S3Client, bucket: str, prefix: str) -> int:
    """Delete every object under `prefix`; returns how many were deleted."""
    deleted = 0
    paginator = s3.get_paginator("list_objects_v2")
    async for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        keys: list[ObjectIdentifierTypeDef] = [
            {"Key": obj["Key"]} for obj in page.get("Contents", []) if "Key" in obj
        ]
        if keys:
            await s3.delete_objects(Bucket=bucket, Delete={"Objects": keys, "Quiet": True})
            deleted += len(keys)
    return deleted
