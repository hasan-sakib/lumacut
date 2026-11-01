"""Resumable uploads: browser PUTs parts straight to object storage via presigned URLs.

The server never trusts client bookkeeping: which parts arrived is read from storage (ListParts),
so a client that lost its state (page refresh) can always ask and resume.
"""

import math
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import PurePosixPath

from botocore.exceptions import ClientError
from fastapi import APIRouter, status
from pydantic import Field

from lumacut_api.assets_service import AssetOut, enqueue_processing, publish_state, to_asset_out
from lumacut_api.deps import CurrentUser, ResourcesDep, SessionDep
from lumacut_api.errors import ApiError, error_responses
from lumacut_core.camel import CamelModel
from lumacut_core.db import Asset
from lumacut_core.ids import new_id
from lumacut_core.storage import PRESIGN_TTL_S, AssetKeys, presign_upload_part

router = APIRouter(prefix="/api/uploads", tags=["uploads"])

MAX_URLS_PER_REQUEST = 100


class CreateUpload(CamelModel):
    file_name: str = Field(min_length=1, max_length=1024)
    size_bytes: int = Field(gt=0)
    mime_type: str = Field(default="application/octet-stream", max_length=255)


class UploadOut(CamelModel):
    asset_id: str
    size_bytes: int
    part_size_bytes: int
    part_count: int


class UploadedPart(CamelModel):
    part_number: int
    size_bytes: int


class UploadStatus(UploadOut):
    file_name: str
    uploaded_parts: list[UploadedPart]


class PartUrlsRequest(CamelModel):
    part_numbers: list[int] = Field(min_length=1, max_length=MAX_URLS_PER_REQUEST)


class PartUrl(CamelModel):
    part_number: int
    url: str


class PartUrlsOut(CamelModel):
    urls: list[PartUrl]
    expires_at: datetime


def guess_kind(mime_type: str) -> str | None:
    family = mime_type.split("/", 1)[0].lower()
    return family if family in ("video", "audio", "image") else None


def display_name(file_name: str) -> str:
    stem = PurePosixPath(file_name.replace("\\", "/")).name
    return stem[:255] or "Untitled"


def part_count(size_bytes: int, part_size: int) -> int:
    return max(1, math.ceil(size_bytes / part_size))


async def _owned_upload(session: SessionDep, user: CurrentUser, asset_id: str) -> Asset:
    asset = await session.get(Asset, asset_id)
    if asset is None or asset.owner_id != user.id:
        raise ApiError(404, "not_found", "This upload does not exist.")
    if asset.status != "uploading" or asset.upload_id is None:
        raise ApiError(409, "upload_finished", "This upload is already complete.")
    return asset


@dataclass(frozen=True)
class StoredPart:
    part_number: int
    size_bytes: int
    etag: str


async def _list_parts(resources: ResourcesDep, asset: Asset) -> list[StoredPart]:
    """Parts storage has received for this upload, ordered by part number."""
    assert asset.upload_id is not None
    parts: list[StoredPart] = []
    paginator = resources.s3.get_paginator("list_parts")
    async for page in paginator.paginate(
        Bucket=resources.settings.s3_bucket, Key=asset.original_key, UploadId=asset.upload_id
    ):
        parts += [
            StoredPart(p["PartNumber"], p["Size"], p["ETag"])
            for p in page.get("Parts", [])
            if "PartNumber" in p and "Size" in p and "ETag" in p
        ]
    return sorted(parts, key=lambda p: p.part_number)


@router.post("", status_code=status.HTTP_201_CREATED, responses=error_responses(401, 413, 422))
async def create_upload(
    body: CreateUpload, user: CurrentUser, session: SessionDep, resources: ResourcesDep
) -> UploadOut:
    """Start a resumable upload; the asset appears in the library as `uploading`."""
    settings = resources.settings
    if body.size_bytes > settings.max_upload_bytes:
        limit_gib = settings.max_upload_bytes / 1024**3
        raise ApiError(413, "file_too_large", f"Files can be at most {limit_gib:g} GiB.")
    asset_id = new_id()
    name = display_name(body.file_name)
    key = AssetKeys(user.id, asset_id).original(PurePosixPath(name).suffix)
    created = await resources.s3.create_multipart_upload(
        Bucket=settings.s3_bucket, Key=key, ContentType=body.mime_type
    )
    asset = Asset(
        id=asset_id,
        owner_id=user.id,
        kind=guess_kind(body.mime_type),
        name=name,
        original_filename=body.file_name,
        mime_type=body.mime_type,
        size_bytes=body.size_bytes,
        status="uploading",
        progress=0.0,
        attempts=0,
        upload_id=created["UploadId"],
        original_key=key,
    )
    session.add(asset)
    await session.commit()
    return UploadOut(
        asset_id=asset_id,
        size_bytes=body.size_bytes,
        part_size_bytes=settings.upload_part_size_bytes,
        part_count=part_count(body.size_bytes, settings.upload_part_size_bytes),
    )


@router.get("/{asset_id}", responses=error_responses(401, 404, 409))
async def upload_status(
    asset_id: str, user: CurrentUser, session: SessionDep, resources: ResourcesDep
) -> UploadStatus:
    """Which parts storage already has; used to resume after a refresh or network loss."""
    asset = await _owned_upload(session, user, asset_id)
    part_size = resources.settings.upload_part_size_bytes
    return UploadStatus(
        asset_id=asset.id,
        file_name=asset.original_filename,
        size_bytes=asset.size_bytes,
        part_size_bytes=part_size,
        part_count=part_count(asset.size_bytes, part_size),
        uploaded_parts=[
            UploadedPart(part_number=p.part_number, size_bytes=p.size_bytes)
            for p in await _list_parts(resources, asset)
        ],
    )


@router.post("/{asset_id}/part-urls", responses=error_responses(401, 404, 409, 422))
async def part_urls(
    asset_id: str,
    body: PartUrlsRequest,
    user: CurrentUser,
    session: SessionDep,
    resources: ResourcesDep,
) -> PartUrlsOut:
    """Presigned PUT URLs for the given part numbers (1-based)."""
    asset = await _owned_upload(session, user, asset_id)
    assert asset.upload_id is not None
    total = part_count(asset.size_bytes, resources.settings.upload_part_size_bytes)
    bad = [n for n in body.part_numbers if not 1 <= n <= total]
    if bad:
        raise ApiError(422, "invalid_part", f"Part numbers must be between 1 and {total}.")
    urls = [
        PartUrl(
            part_number=n,
            url=await presign_upload_part(
                resources.s3_public,
                resources.settings.s3_bucket,
                asset.original_key,
                asset.upload_id,
                n,
            ),
        )
        for n in sorted(set(body.part_numbers))
    ]
    expires = datetime.now(UTC) + timedelta(seconds=PRESIGN_TTL_S)
    return PartUrlsOut(urls=urls, expires_at=expires)


@router.post("/{asset_id}/complete", responses=error_responses(401, 404, 409))
async def complete_upload(
    asset_id: str, user: CurrentUser, session: SessionDep, resources: ResourcesDep
) -> AssetOut:
    """Verify every part arrived, assemble the file and queue it for processing."""
    asset = await _owned_upload(session, user, asset_id)
    assert asset.upload_id is not None
    settings = resources.settings
    total = part_count(asset.size_bytes, settings.upload_part_size_bytes)
    parts = [p for p in await _list_parts(resources, asset) if p.part_number <= total]
    present = {p.part_number for p in parts}
    missing = [n for n in range(1, total + 1) if n not in present]
    if missing:
        shown = ", ".join(map(str, missing[:10])) + ("…" if len(missing) > 10 else "")
        raise ApiError(409, "incomplete_upload", f"Parts still missing: {shown}.")
    received = sum(p.size_bytes for p in parts)
    if received != asset.size_bytes:
        raise ApiError(
            409,
            "size_mismatch",
            f"Received {received} bytes but the file is {asset.size_bytes} bytes. "
            "Start the upload again.",
        )
    try:
        await resources.s3.complete_multipart_upload(
            Bucket=settings.s3_bucket,
            Key=asset.original_key,
            UploadId=asset.upload_id,
            MultipartUpload={
                "Parts": [{"PartNumber": p.part_number, "ETag": p.etag} for p in parts]
            },
        )
    except ClientError as exc:
        raise ApiError(
            409, "complete_failed", f"Storage could not assemble the file: {exc}"
        ) from exc
    asset.upload_id = None
    asset.status = "queued"
    asset.stage = None
    asset.progress = 0.0
    asset.attempts = 1
    await session.commit()
    await enqueue_processing(resources.media_queue, asset)
    await publish_state(resources.redis, asset)
    return await to_asset_out(asset, resources.s3_public, settings.s3_bucket)
