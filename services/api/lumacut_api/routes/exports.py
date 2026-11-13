"""Server exports: ask for one, follow it, download it, cancel or remove it."""

import structlog
from fastapi import APIRouter, Query, status
from sqlalchemy import select

from lumacut_api.deps import CurrentUser, ResourcesDep, SessionDep
from lumacut_api.errors import ApiError, error_responses
from lumacut_api.exports_service import (
    ExportCreate,
    ExportList,
    ExportOut,
    ExportSettingsIn,
    enqueue_export,
    publish_state,
)
from lumacut_core.db import ExportJob, ProjectRecord
from lumacut_core.ids import new_id
from lumacut_core.storage import delete_prefix, presign_get

router = APIRouter(prefix="/api/exports", tags=["exports"])
log = structlog.get_logger()

FINISHED = ("done", "failed", "cancelled")


async def _out(row: ExportJob, resources: ResourcesDep) -> ExportOut:
    url = None
    if row.status == "done" and row.output_key:
        url = await presign_get(resources.s3_public, resources.settings.s3_bucket, row.output_key)
    return ExportOut(
        id=row.id,
        project_id=row.project_id,
        composition_id=row.composition_id,
        name=row.name,
        settings=ExportSettingsIn.model_validate(row.settings),
        status=row.status,
        progress=row.progress,
        error_message=row.error_message,
        warnings=list(row.warnings or []),
        size_bytes=row.size_bytes,
        created_at=row.created_at,
        finished_at=row.finished_at,
        download_url=url,
    )


async def _owned(session: SessionDep, user: CurrentUser, export_id: str) -> ExportJob:
    row = await session.get(ExportJob, export_id)
    if row is None or row.owner_id != user.id:
        raise ApiError(404, "not_found", "This export does not exist or was removed.")
    return row


@router.post("", status_code=status.HTTP_201_CREATED, responses=error_responses(401, 404, 422))
async def create_export(
    body: ExportCreate, user: CurrentUser, session: SessionDep, resources: ResourcesDep
) -> ExportOut:
    """Export a composition on the server. The project is copied as it is now."""
    project = await session.get(ProjectRecord, body.project_id)
    if project is None or project.owner_id != user.id:
        raise ApiError(404, "not_found", "This project does not exist or was deleted.")
    compositions = project.doc.get("compositions", [])
    if not any(c.get("id") == body.composition_id for c in compositions):
        raise ApiError(422, "unknown_composition", "That composition isn't in the project.")
    row = ExportJob(
        id=new_id(),
        owner_id=user.id,
        project_id=project.id,
        composition_id=body.composition_id,
        name=(body.name or project.name)[:255],
        settings=body.settings.model_dump(by_alias=True),
        doc=project.doc,
        status="queued",
        progress=0.0,
    )
    session.add(row)
    await session.commit()
    await enqueue_export(resources.export_queue, row)
    await publish_state(resources.redis, row)
    log.info("export.created", export_id=row.id, format=body.settings.format)
    return await _out(row, resources)


@router.get("", responses=error_responses(401))
async def list_exports(
    user: CurrentUser,
    session: SessionDep,
    resources: ResourcesDep,
    project_id: str | None = Query(default=None, alias="projectId"),
) -> ExportList:
    """The user's server exports (of one project, if given), newest first."""
    query = select(ExportJob).where(ExportJob.owner_id == user.id)
    if project_id is not None:
        query = query.where(ExportJob.project_id == project_id)
    rows = (await session.scalars(query.order_by(ExportJob.created_at.desc()).limit(100))).all()
    return ExportList(items=[await _out(r, resources) for r in rows])


@router.get("/{export_id}", responses=error_responses(401, 404))
async def get_export(
    export_id: str, user: CurrentUser, session: SessionDep, resources: ResourcesDep
) -> ExportOut:
    """One export, with a download link when it is done."""
    return await _out(await _owned(session, user, export_id), resources)


@router.post("/{export_id}/cancel", responses=error_responses(401, 404))
async def cancel_export(
    export_id: str, user: CurrentUser, session: SessionDep, resources: ResourcesDep
) -> ExportOut:
    """Stop an export that hasn't finished (the worker notices within a few frames)."""
    row = await _owned(session, user, export_id)
    if row.status not in FINISHED:
        row.status = "cancelled"
        await session.commit()
        await publish_state(resources.redis, row)
    return await _out(row, resources)


@router.delete(
    "/{export_id}", status_code=status.HTTP_204_NO_CONTENT, responses=error_responses(401, 404)
)
async def delete_export(
    export_id: str, user: CurrentUser, session: SessionDep, resources: ResourcesDep
) -> None:
    """Remove an export and its file (a running one is cancelled first)."""
    row = await _owned(session, user, export_id)
    await delete_prefix(
        resources.s3, resources.settings.s3_bucket, f"users/{row.owner_id}/exports/{row.id}/"
    )
    if row.status not in FINISHED:
        row.status = "cancelled"
    await publish_state(resources.redis, row, deleted=True)
    await session.delete(row)
    await session.commit()
