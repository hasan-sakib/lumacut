from typing import Annotated, Any

import structlog
from fastapi import APIRouter, Header, status
from sqlalchemy import select, update

from lumacut_api.deps import CurrentUser, SessionDep
from lumacut_api.errors import ApiError, error_responses
from lumacut_api.projects_service import (
    ProjectCreate,
    ProjectOut,
    ProjectSave,
    ProjectSummary,
    SnapshotCreate,
    SnapshotOut,
    default_document,
    validate_document,
)
from lumacut_core.camel import CamelModel
from lumacut_core.db import ProjectRecord, ProjectSnapshot
from lumacut_core.ids import new_id

router = APIRouter(prefix="/api/projects", tags=["projects"])
log = structlog.get_logger()

#: Most snapshots kept per project (the oldest are dropped).
MAX_SNAPSHOTS = 100


class ProjectList(CamelModel):
    items: list[ProjectSummary]


class SnapshotList(CamelModel):
    items: list[SnapshotOut]


def _summary(row: ProjectRecord) -> ProjectSummary:
    return ProjectSummary.model_validate(row, from_attributes=True)


def _out(row: ProjectRecord) -> ProjectOut:
    return ProjectOut.model_validate(row, from_attributes=True)


async def _owned(session: SessionDep, user: CurrentUser, project_id: str) -> ProjectRecord:
    row = await session.get(ProjectRecord, project_id)
    if row is None or row.owner_id != user.id:
        raise ApiError(404, "not_found", "This project does not exist or was deleted.")
    return row


def _expected_version(if_match: str | None) -> int:
    """The version a save is based on, from `If-Match: 3` (quotes and a `W/` prefix are fine)."""
    if if_match is None:
        raise ApiError(
            428,
            "precondition_required",
            "Send the version you are saving over in the If-Match header.",
        )
    text = if_match.strip().removeprefix("W/").strip('"')
    if not text.isdigit():
        raise ApiError(400, "invalid_if_match", "If-Match must be the project's version number.")
    return int(text)


async def _save(
    session: SessionDep,
    user: CurrentUser,
    project_id: str,
    expected: int,
    doc: dict[str, Any],
) -> ProjectRecord:
    """Replace the document if (and only if) the stored version is `expected`."""
    stored = validate_document(doc)
    statement = (
        update(ProjectRecord)
        .where(
            ProjectRecord.id == project_id,
            ProjectRecord.owner_id == user.id,
            ProjectRecord.version == expected,
        )
        .values(
            doc=stored,
            name=str(stored["name"])[:255],
            kind=stored["kind"],
            version=ProjectRecord.version + 1,
        )
        .returning(ProjectRecord)
        .execution_options(populate_existing=True)
    )
    row = (await session.execute(statement)).scalar_one_or_none()
    if row is None:
        current = await _owned(session, user, project_id)  # 404 if it isn't theirs / is gone
        raise ApiError(
            412,
            "version_conflict",
            f"This project changed elsewhere (saved version {current.version}, yours is "
            f"{expected}). Reload it, or keep your copy and save again.",
            headers={"ETag": str(current.version)},
        )
    await session.commit()
    return row


@router.post("", status_code=status.HTTP_201_CREATED, responses=error_responses(401, 422))
async def create_project(
    body: ProjectCreate, user: CurrentUser, session: SessionDep
) -> ProjectOut:
    """Create a project with one empty composition."""
    doc = validate_document(default_document(body.name.strip() or "Untitled", body.kind))
    row = ProjectRecord(
        id=str(doc["id"]), owner_id=user.id, name=str(doc["name"])[:255], kind=body.kind, doc=doc
    )
    session.add(row)
    await session.commit()
    log.info("project.created", project_id=row.id)
    return _out(row)


@router.get("", responses=error_responses(401))
async def list_projects(user: CurrentUser, session: SessionDep) -> ProjectList:
    """The user's projects, most recently saved first (without their documents)."""
    rows = (
        await session.execute(
            select(
                ProjectRecord.id,
                ProjectRecord.name,
                ProjectRecord.kind,
                ProjectRecord.version,
                ProjectRecord.created_at,
                ProjectRecord.updated_at,
            )
            .where(ProjectRecord.owner_id == user.id)
            .order_by(ProjectRecord.updated_at.desc(), ProjectRecord.id)
        )
    ).all()
    return ProjectList(
        items=[ProjectSummary.model_validate(r, from_attributes=True) for r in rows]
    )


@router.get("/{project_id}", responses=error_responses(401, 404))
async def get_project(project_id: str, user: CurrentUser, session: SessionDep) -> ProjectOut:
    return _out(await _owned(session, user, project_id))


@router.put("/{project_id}", responses=error_responses(400, 401, 404, 412, 413, 422, 428))
async def save_project(
    project_id: str,
    body: ProjectSave,
    user: CurrentUser,
    session: SessionDep,
    if_match: Annotated[str | None, Header()] = None,
) -> ProjectOut:
    """Save the whole document. `If-Match` is the version it was loaded or last saved at; a stale
    version gets 412 with the current version in the `ETag` header."""
    expected = _expected_version(if_match)
    return _out(await _save(session, user, project_id, expected, body.doc))


@router.delete(
    "/{project_id}", status_code=status.HTTP_204_NO_CONTENT, responses=error_responses(401, 404)
)
async def delete_project(project_id: str, user: CurrentUser, session: SessionDep) -> None:
    row = await _owned(session, user, project_id)
    await session.delete(row)
    await session.commit()
    log.info("project.deleted", project_id=project_id)


@router.post(
    "/{project_id}/snapshots",
    status_code=status.HTTP_201_CREATED,
    responses=error_responses(401, 404),
)
async def create_snapshot(
    project_id: str, body: SnapshotCreate, user: CurrentUser, session: SessionDep
) -> SnapshotOut:
    """Keep a restorable copy of the project as it is stored now."""
    row = await _owned(session, user, project_id)
    snapshot = ProjectSnapshot(
        id=new_id(), project_id=row.id, version=row.version, label=body.label, doc=row.doc
    )
    session.add(snapshot)
    await session.flush()
    older = (
        (
            await session.execute(
                select(ProjectSnapshot.id)
                .where(ProjectSnapshot.project_id == row.id)
                .order_by(ProjectSnapshot.created_at.desc(), ProjectSnapshot.id)
                .offset(MAX_SNAPSHOTS)
            )
        )
        .scalars()
        .all()
    )
    for stale in older:
        await session.delete(await session.get_one(ProjectSnapshot, stale))
    await session.commit()
    return SnapshotOut.model_validate(snapshot, from_attributes=True)


@router.get("/{project_id}/snapshots", responses=error_responses(401, 404))
async def list_snapshots(project_id: str, user: CurrentUser, session: SessionDep) -> SnapshotList:
    row = await _owned(session, user, project_id)
    rows = (
        (
            await session.execute(
                select(ProjectSnapshot)
                .where(ProjectSnapshot.project_id == row.id)
                .order_by(ProjectSnapshot.created_at.desc(), ProjectSnapshot.id)
            )
        )
        .scalars()
        .all()
    )
    return SnapshotList(items=[SnapshotOut.model_validate(s, from_attributes=True) for s in rows])


@router.post(
    "/{project_id}/snapshots/{snapshot_id}/restore",
    responses=error_responses(400, 401, 404, 412, 428),
)
async def restore_snapshot(
    project_id: str,
    snapshot_id: str,
    user: CurrentUser,
    session: SessionDep,
    if_match: Annotated[str | None, Header()] = None,
) -> ProjectOut:
    """Make the snapshot's document the current one (as a new version, so it can be undone by
    restoring an earlier snapshot)."""
    expected = _expected_version(if_match)
    row = await _owned(session, user, project_id)
    snapshot = await session.get(ProjectSnapshot, snapshot_id)
    if snapshot is None or snapshot.project_id != row.id:
        raise ApiError(404, "not_found", "This snapshot does not exist or was deleted.")
    return _out(await _save(session, user, project_id, expected, snapshot.doc))
