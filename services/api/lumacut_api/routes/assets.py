import asyncio
from typing import Annotated, Literal

import structlog
from fastapi import APIRouter, Query, status
from rq.command import send_stop_job_command
from rq.exceptions import InvalidJobOperation, NoSuchJobError
from rq.job import Job
from sqlalchemy import select

from lumacut_api.assets_service import (
    AssetOut,
    enqueue_processing,
    job_id,
    publish_state,
    to_asset_out,
)
from lumacut_api.deps import CurrentUser, ResourcesDep, SessionDep
from lumacut_api.errors import ApiError, error_responses
from lumacut_core.camel import CamelModel
from lumacut_core.db import Asset, ProjectRecord
from lumacut_core.storage import AssetKeys, delete_prefix

router = APIRouter(prefix="/api/assets", tags=["assets"])
log = structlog.get_logger()


class AssetList(CamelModel):
    items: list[AssetOut]
    total: int


def _like_pattern(q: str) -> str:
    escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


async def _owned(session: SessionDep, user: CurrentUser, asset_id: str) -> Asset:
    asset = await session.get(Asset, asset_id)
    if asset is None or asset.owner_id != user.id:
        raise ApiError(404, "not_found", "This asset does not exist or was deleted.")
    return asset


@router.get("", responses=error_responses(401))
async def list_assets(
    user: CurrentUser,
    session: SessionDep,
    resources: ResourcesDep,
    q: Annotated[str | None, Query(max_length=200, description="Search in names")] = None,
    kind: Literal["video", "audio", "image", "lut"] | None = None,
    status: Literal["uploading", "queued", "processing", "ready", "failed"] | None = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
) -> AssetList:
    """The user's assets, newest first."""
    query = select(Asset).where(Asset.owner_id == user.id)
    if q and q.strip():
        query = query.where(Asset.name.ilike(_like_pattern(q.strip()), escape="\\"))
    if kind:
        query = query.where(Asset.kind == kind)
    if status:
        query = query.where(Asset.status == status)
    rows = (await session.scalars(query.order_by(Asset.created_at.desc(), Asset.id))).all()
    bucket = resources.settings.s3_bucket
    items = [await to_asset_out(a, resources.s3_public, bucket) for a in rows[:limit]]
    return AssetList(items=items, total=len(rows))


@router.get("/{asset_id}", responses=error_responses(401, 404))
async def get_asset(
    asset_id: str, user: CurrentUser, session: SessionDep, resources: ResourcesDep
) -> AssetOut:
    asset = await _owned(session, user, asset_id)
    return await to_asset_out(asset, resources.s3_public, resources.settings.s3_bucket)


def _stop_job(resources: ResourcesDep, asset: Asset) -> None:
    """Best effort: cancel a queued job or stop a running one."""
    try:
        job = Job.fetch(job_id(asset), connection=resources.sync_redis)
    except NoSuchJobError:
        return
    status = job.get_status()
    try:
        if status == "started":
            send_stop_job_command(resources.sync_redis, job.id)
        elif status in ("queued", "deferred", "scheduled"):
            job.cancel()
    except InvalidJobOperation:
        pass


@router.delete(
    "/{asset_id}", status_code=status.HTTP_204_NO_CONTENT, responses=error_responses(401, 404, 409)
)
async def delete_asset(
    asset_id: str, user: CurrentUser, session: SessionDep, resources: ResourcesDep
) -> None:
    """Delete an asset, its original and every rendition (also cancels an unfinished upload)."""
    asset = await _owned(session, user, asset_id)
    using = (
        (
            await session.execute(
                select(ProjectRecord.name).where(
                    ProjectRecord.owner_id == user.id,
                    ProjectRecord.doc["assets"].contains([{"id": asset.id}]),
                )
            )
        )
        .scalars()
        .all()
    )
    if using:
        raise ApiError(
            409,
            "asset_in_use",
            "This asset is used in "
            + ", ".join(f"“{name}”" for name in using[:3])
            + ". Remove it from the project first.",
        )
    bucket = resources.settings.s3_bucket
    if asset.status in ("queued", "processing"):
        await asyncio.to_thread(_stop_job, resources, asset)
    if asset.upload_id is not None:
        await resources.s3.abort_multipart_upload(
            Bucket=bucket, Key=asset.original_key, UploadId=asset.upload_id
        )
    removed = await delete_prefix(resources.s3, bucket, AssetKeys(user.id, asset.id).prefix)
    await session.delete(asset)
    await session.commit()
    await publish_state(resources.redis, asset, deleted=True)
    log.info("asset.deleted", asset_id=asset.id, objects=removed)


@router.post("/{asset_id}/retry", responses=error_responses(401, 404, 409))
async def retry_asset(
    asset_id: str, user: CurrentUser, session: SessionDep, resources: ResourcesDep
) -> AssetOut:
    """Process a failed asset again from the original upload."""
    asset = await _owned(session, user, asset_id)
    if asset.status != "failed":
        raise ApiError(409, "not_failed", "Only failed assets can be retried.")
    asset.status = "queued"
    asset.stage = None
    asset.progress = 0.0
    asset.error_code = None
    asset.error_message = None
    asset.attempts += 1
    await session.commit()
    await enqueue_processing(resources.media_queue, asset)
    await publish_state(resources.redis, asset)
    return await to_asset_out(asset, resources.s3_public, resources.settings.s3_bucket)
