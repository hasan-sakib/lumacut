"""Asset helpers shared by the upload, asset and event routes."""

from __future__ import annotations

import asyncio
from datetime import datetime
from typing import TYPE_CHECKING, Any, Literal

from pydantic import Field
from rq import Callback, Queue

from lumacut_core.camel import CamelModel
from lumacut_core.db import Asset
from lumacut_core.events import AssetStateEvent, user_assets_channel
from lumacut_schema.models import AudioStreamInfo, ImageInfo, VideoStreamInfo

if TYPE_CHECKING:
    from redis.asyncio import Redis as AsyncRedis
    from types_aiobotocore_s3 import S3Client

from lumacut_core.storage import presign_get

PROCESS_JOB = "lumacut_worker.jobs.media.process_asset"
FAILURE_CALLBACK = "lumacut_worker.jobs.media.on_process_failure"
MIB = 1024 * 1024


class Dimensions(CamelModel):
    width: int
    height: int


class LutInfo(CamelModel):
    """Summary of a validated `.cube` look-up table."""

    title: str
    dimension: Literal[1, 3]
    size: int


class AssetMedia(CamelModel):
    """Technical metadata from the probe; shapes match packages/schema (Asset.video/audio/image)."""

    video: VideoStreamInfo | None = None
    audio: AudioStreamInfo | None = None
    image: ImageInfo | None = None
    lut: LutInfo | None = None
    downscaled_from: Dimensions | None = None


class AssetUrls(CamelModel):
    """Presigned GET URLs (valid ~1 h) for the renditions that exist."""

    poster: str | None = None
    thumb_index: str | None = None
    thumb_sheets: list[str] = Field(default_factory=list)
    waveform: str | None = None
    proxy: str | None = None
    preview: str | None = None
    thumb: str | None = None
    normalized: str | None = None
    lut: str | None = None
    #: The upload itself (video and audio): exports read it instead of the proxy.
    original: str | None = None


class AssetOut(CamelModel):
    id: str
    kind: Literal["video", "audio", "image", "lut"] | None
    name: str
    mime_type: str
    size_bytes: int
    status: Literal["uploading", "queued", "processing", "ready", "failed"]
    stage: str | None
    progress: float
    error_code: str | None
    error_message: str | None
    attempts: int
    created_at: datetime
    updated_at: datetime
    ready_at: datetime | None
    media: AssetMedia | None
    urls: AssetUrls


async def to_asset_out(asset: Asset, s3_public: S3Client, bucket: str) -> AssetOut:
    urls = AssetUrls()
    renditions: dict[str, Any] = asset.renditions or {}
    if asset.status == "ready":
        for field in ("poster", "waveform", "proxy", "preview", "thumb", "normalized", "lut"):
            key = renditions.get(field)
            if isinstance(key, str):
                setattr(urls, field, await presign_get(s3_public, bucket, key))
        if asset.kind in ("video", "audio") and asset.original_key:
            urls.original = await presign_get(s3_public, bucket, asset.original_key)
        thumbs = renditions.get("thumbs")
        if isinstance(thumbs, dict):
            urls.thumb_index = await presign_get(s3_public, bucket, str(thumbs["index"]))
            urls.thumb_sheets = [
                await presign_get(s3_public, bucket, str(k)) for k in thumbs.get("sheets", [])
            ]
    return AssetOut(
        id=asset.id,
        kind=asset.kind,
        name=asset.name,
        mime_type=asset.mime_type,
        size_bytes=asset.size_bytes,
        status=asset.status,
        stage=asset.stage,
        progress=asset.progress,
        error_code=asset.error_code,
        error_message=asset.error_message,
        attempts=asset.attempts,
        created_at=asset.created_at,
        updated_at=asset.updated_at,
        ready_at=asset.ready_at,
        media=AssetMedia.model_validate(asset.media) if asset.media else None,
        urls=urls,
    )


def state_event(asset: Asset, *, deleted: bool = False) -> AssetStateEvent:
    return AssetStateEvent(
        asset_id=asset.id,
        status=asset.status,
        stage=asset.stage,
        progress=asset.progress,
        error_code=asset.error_code,
        error_message=asset.error_message,
        attempts=asset.attempts,
        deleted=deleted,
    )


async def publish_state(redis: AsyncRedis, asset: Asset, *, deleted: bool = False) -> None:
    payload = state_event(asset, deleted=deleted).model_dump_json()
    await redis.publish(user_assets_channel(asset.owner_id), payload)


def job_timeout_s(size_bytes: int) -> int:
    """Duration is unknown before the probe, so the budget scales with file size:
    15 min base + 2 s per MiB (a 20 GiB upload gets ~12 h)."""
    return 900 + 2 * (size_bytes // MIB)


def job_id(asset: Asset) -> str:
    return f"process-{asset.id}-{asset.attempts}"


async def enqueue_processing(queue: Queue, asset: Asset) -> None:
    """Enqueue the processing job for the asset's current attempt (caller bumps `attempts`)."""
    await asyncio.to_thread(
        queue.enqueue,
        PROCESS_JOB,
        asset.id,
        job_id=job_id(asset),
        job_timeout=job_timeout_s(asset.size_bytes),
        on_failure=Callback(FAILURE_CALLBACK),
        result_ttl=3600,
        failure_ttl=7 * 24 * 3600,
    )
