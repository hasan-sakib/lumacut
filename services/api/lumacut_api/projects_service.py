"""Project documents: request/response models, the default new project, and validation."""

import json
from datetime import UTC, datetime
from typing import Any, Literal

from pydantic import Field, ValidationError

from lumacut_api.errors import ApiError
from lumacut_core.camel import CamelModel
from lumacut_core.ids import new_id
from lumacut_schema.models import Project as ProjectDocument

#: Upper bound for one saved document (autosave sends the whole thing).
MAX_DOCUMENT_BYTES = 16 * 1024 * 1024
ProjectKind = Literal["video", "motion", "photo"]


class ProjectSummary(CamelModel):
    id: str
    name: str
    kind: ProjectKind
    version: int
    created_at: datetime
    updated_at: datetime


class ProjectOut(ProjectSummary):
    """The summary plus the document (a `Project` of packages/schema, as JSON)."""

    doc: dict[str, Any]


class ProjectCreate(CamelModel):
    name: str = Field(min_length=1, max_length=255)
    kind: ProjectKind = "video"


class ProjectSave(CamelModel):
    doc: dict[str, Any]


class SnapshotCreate(CamelModel):
    label: str | None = Field(default=None, max_length=255)


class SnapshotOut(CamelModel):
    id: str
    version: int
    label: str | None
    created_at: datetime


def iso_now() -> str:
    """UTC timestamp in the schema's `IsoUtcDateTime` form (metadata only)."""
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def default_document(name: str, kind: ProjectKind) -> dict[str, Any]:
    """A new project: one 1080p30 composition with an empty picture track and an empty audio track."""
    now = iso_now()
    black = {"r": 0, "g": 0, "b": 0, "a": 1}

    def track(name: str, kind: str) -> dict[str, Any]:
        return {
            "id": new_id(),
            "name": name,
            "kind": kind,
            "muted": False,
            "locked": False,
            "hidden": False,
            "solo": False,
            "clips": [],
        }

    composition_id = new_id()
    return {
        "id": new_id(),
        "schemaVersion": 1,
        "name": name,
        "kind": kind,
        "assets": [],
        "compositions": [
            {
                "id": composition_id,
                "name": "Main",
                "width": 1920,
                "height": 1080,
                "fps": {"num": 30, "den": 1},
                "durationUs": 0,
                "background": black,
                "tracks": [track("Video 1", "visual"), track("Audio 1", "audio")],
                "markers": [],
            }
        ],
        "mainCompositionId": composition_id,
        "meta": {"createdAt": now, "updatedAt": now, "aiRuns": []},
    }


def validate_document(doc: dict[str, Any]) -> dict[str, Any]:
    """Checks `doc` against the generated `Project` model and stamps `meta.updatedAt`.

    Returns the document to store (the caller's dict, validated, with the server's timestamp).
    Raises a 422 `invalid_project` listing the first problems.
    """
    if len(json.dumps(doc, separators=(",", ":"))) > MAX_DOCUMENT_BYTES:
        raise ApiError(
            413, "project_too_large", "This project is too large to save. Remove unused assets."
        )
    try:
        ProjectDocument.model_validate(doc)
    except ValidationError as exc:
        problems = [
            f"{'.'.join(str(p) for p in err['loc']) or 'project'}: {err['msg']}"
            for err in exc.errors()[:3]
        ]
        raise ApiError(
            422, "invalid_project", "The project isn't valid: " + "; ".join(problems)
        ) from exc
    stamped: dict[str, Any] = {**doc, "meta": {**doc["meta"], "updatedAt": iso_now()}}
    return stamped
