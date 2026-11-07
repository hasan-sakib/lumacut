"""RQ jobs for uploaded assets: run the pipeline and publish state to the DB and Valkey.

The pipeline itself (lumacut_worker.pipeline) works on local files; this module adds storage,
the asset row, progress events, and failure handling.
"""

from __future__ import annotations

import asyncio
import json
import tempfile
import time
from collections.abc import AsyncIterator
from concurrent.futures import Future
from contextlib import AsyncExitStack, asynccontextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path, PurePosixPath
from typing import TYPE_CHECKING, Any

import structlog
from redis.asyncio import Redis as AsyncRedis
from rq.timeouts import JobTimeoutException
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from lumacut_core.db import Asset, create_engine, create_sessionmaker
from lumacut_core.events import AssetStateEvent, user_assets_channel
from lumacut_core.logging import configure_logging
from lumacut_core.storage import AssetKeys, delete_prefix, open_s3, upload_file
from lumacut_worker.pipeline.errors import MESSAGES, ProcessingError
from lumacut_worker.pipeline.process import PipelineResult, process_file
from lumacut_worker.settings import Settings

if TYPE_CHECKING:
    from types_aiobotocore_s3 import S3Client

log = structlog.get_logger()

PROGRESS_INTERVAL_S = 0.5
PIPELINE_SHARE = 0.97  # the rest is uploading renditions

CONTENT_TYPES = {
    ".mp4": "video/mp4",
    ".m4a": "audio/mp4",
    ".flac": "audio/flac",
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".json": "application/json",
    ".cube": "text/plain; charset=utf-8",
}


@dataclass(frozen=True)
class JobContext:
    settings: Settings
    sessions: async_sessionmaker[AsyncSession]
    redis: AsyncRedis
    s3: S3Client


@asynccontextmanager
async def job_context() -> AsyncIterator[JobContext]:
    settings = Settings()
    configure_logging(settings.log_level, settings.log_json)
    async with AsyncExitStack() as stack:
        engine = create_engine(settings.database_url)
        stack.push_async_callback(engine.dispose)
        redis = AsyncRedis.from_url(settings.redis_url)
        stack.push_async_callback(redis.aclose)
        s3 = await stack.enter_async_context(open_s3(settings))
        yield JobContext(settings, create_sessionmaker(engine), redis, s3)


async def save_state(ctx: JobContext, asset_id: str, **changes: Any) -> Asset | None:
    """Apply changes to the asset row and publish its new state. None if it was deleted."""
    async with ctx.sessions() as session:
        asset = await session.get(Asset, asset_id)
        if asset is None:
            return None
        for name, value in changes.items():
            setattr(asset, name, value)
        await session.commit()
        event = AssetStateEvent(
            asset_id=asset.id,
            status=asset.status,
            stage=asset.stage,
            progress=asset.progress,
            error_code=asset.error_code,
            error_message=asset.error_message,
            attempts=asset.attempts,
        )
        await ctx.redis.publish(user_assets_channel(asset.owner_id), event.model_dump_json())
        return asset


class ProgressReporter:
    """Called from the pipeline thread; forwards throttled, ordered updates to the event loop."""

    def __init__(self, ctx: JobContext, asset_id: str, loop: asyncio.AbstractEventLoop):
        self._ctx = ctx
        self._asset_id = asset_id
        self._loop = loop
        self._last_sent = 0.0
        self._last_stage: str | None = None
        self._pending: Future[Asset | None] | None = None

    def __call__(self, stage: str, progress: float) -> None:
        now = time.monotonic()
        if stage == self._last_stage and now - self._last_sent < PROGRESS_INTERVAL_S:
            return
        if self._pending is not None:
            self._pending.result(timeout=10)  # keep updates in order
        self._last_stage, self._last_sent = stage, now
        self._pending = asyncio.run_coroutine_threadsafe(
            save_state(self._ctx, self._asset_id, stage=stage, progress=progress * PIPELINE_SHARE),
            self._loop,
        )

    def flush(self) -> None:
        if self._pending is not None:
            self._pending.result(timeout=10)


async def download(ctx: JobContext, key: str, dest: Path) -> None:
    """Stream an object to a local file (disk writes run in a thread)."""
    obj = await ctx.s3.get_object(Bucket=ctx.settings.s3_bucket, Key=key)
    out = await asyncio.to_thread(dest.open, "wb")
    try:
        async with obj["Body"] as body:
            while chunk := await body.read(8 * 1024 * 1024):
                await asyncio.to_thread(out.write, chunk)
    finally:
        await asyncio.to_thread(out.close)


async def upload_renditions(
    ctx: JobContext, keys: AssetKeys, result: PipelineResult
) -> dict[str, Any]:
    """Upload every rendition; returns the `renditions` column (rendition name -> object key)."""
    bucket = ctx.settings.s3_bucket
    renditions: dict[str, Any] = {}
    for name, path in result.files.items():
        relative = name if name.startswith("thumbs/") else f"{name}{path.suffix}"
        key = keys.rendition(relative)
        content_type = CONTENT_TYPES.get(path.suffix, "application/octet-stream")
        await upload_file(ctx.s3, bucket, key, path, content_type)
        if not name.startswith("thumbs/"):
            renditions[name] = key
    if result.thumb_index is not None:
        index_key = keys.rendition("thumbs/index.json")
        await ctx.s3.put_object(
            Bucket=bucket,
            Key=index_key,
            Body=json.dumps(result.thumb_index).encode(),
            ContentType="application/json",
        )
        renditions["thumbs"] = {
            "index": index_key,
            "sheets": [keys.rendition(f"thumbs/{s}") for s in result.thumb_index["sheets"]],
        }
    return renditions


async def _process(asset_id: str) -> dict[str, Any]:
    async with job_context() as ctx:
        asset = await save_state(
            ctx,
            asset_id,
            status="processing",
            stage="download",
            progress=0.0,
            error_code=None,
            error_message=None,
        )
        if asset is None:
            log.info("process.skipped_deleted", asset_id=asset_id)
            return {"assetId": asset_id, "status": "deleted"}
        keys = AssetKeys(asset.owner_id, asset.id)
        log.info("process.start", asset_id=asset_id, attempt=asset.attempts, size=asset.size_bytes)
        try:
            with tempfile.TemporaryDirectory(prefix="lumacut-") as tmp:
                src = Path(tmp) / f"original{PurePosixPath(asset.original_key).suffix}"
                await download(ctx, asset.original_key, src)
                reporter = ProgressReporter(ctx, asset_id, asyncio.get_running_loop())
                result = await asyncio.to_thread(process_file, src, Path(tmp) / "work", reporter)
                await asyncio.to_thread(reporter.flush)
                await save_state(ctx, asset_id, stage="finalizing", progress=PIPELINE_SHARE)
                renditions = await upload_renditions(ctx, keys, result)
        except ProcessingError as exc:
            log.warning("process.failed", asset_id=asset_id, code=exc.code, detail=exc.detail)
            await save_state(
                ctx,
                asset_id,
                status="failed",
                stage=None,
                error_code=exc.code,
                error_message=exc.message,
            )
            return {"assetId": asset_id, "status": "failed", "errorCode": exc.code}

        done = await save_state(
            ctx,
            asset_id,
            status="ready",
            stage=None,
            progress=1.0,
            kind=result.kind,
            media=result.media,
            renditions=renditions,
            ready_at=datetime.now(UTC),
        )
        if done is None:
            # Deleted while processing: don't leave orphaned renditions behind.
            await delete_prefix(ctx.s3, ctx.settings.s3_bucket, keys.prefix)
            return {"assetId": asset_id, "status": "deleted"}
        log.info("process.ready", asset_id=asset_id, kind=result.kind)
        return {"assetId": asset_id, "status": "ready"}


def process_asset(asset_id: str) -> dict[str, Any]:
    """RQ entry point (enqueued by the API as `lumacut_worker.jobs.media.process_asset`)."""
    return asyncio.run(_process(asset_id))


async def _mark_failed(asset_id: str, code: str, message: str) -> None:
    async with job_context() as ctx:
        async with ctx.sessions() as session:
            asset = await session.get(Asset, asset_id)
            if asset is None or asset.status in ("ready", "failed"):
                return
        await save_state(
            ctx, asset_id, status="failed", stage=None, error_code=code, error_message=message
        )


def on_process_failure(job: Any, connection: Any, exc_type: Any, exc: Any, tb: Any) -> None:
    """RQ failure callback: also covers crashes and timeouts the job itself can't catch."""
    asset_id = str(job.args[0]) if job.args else ""
    if not asset_id:
        return
    if isinstance(exc, JobTimeoutException) or exc_type is JobTimeoutException:
        message = (
            "Processing took too long and was stopped. Retry; very long or unusual files may "
            "need to be split before uploading."
        )
        code = "processing_timeout"
    else:
        code, message = "processing_failed", MESSAGES["processing_failed"]
    log.error("process.crashed", asset_id=asset_id, error=repr(exc))
    asyncio.run(_mark_failed(asset_id, code, message))
