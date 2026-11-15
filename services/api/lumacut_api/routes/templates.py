"""Saved templates: the user's own (the built-in ones ship with the web app)."""

from datetime import datetime
from typing import Any, Literal

import structlog
from fastapi import APIRouter, status
from pydantic import Field
from sqlalchemy import select

from lumacut_api.deps import CurrentUser, SessionDep
from lumacut_api.errors import ApiError, error_responses
from lumacut_api.projects_service import validate_document
from lumacut_core.camel import CamelModel
from lumacut_core.db import TemplateRecord
from lumacut_core.ids import new_id

router = APIRouter(prefix="/api/templates", tags=["templates"])
log = structlog.get_logger()

TemplateCategory = Literal["reels", "intros", "lowerThirds", "slideshows", "quoteCards", "mine"]


class TemplateCreate(CamelModel):
    name: str = Field(min_length=1, max_length=255)
    category: TemplateCategory = "mine"
    description: str = Field(default="", max_length=1000)
    #: A project document whose placeholder clips are the slots.
    doc: dict[str, Any]


class TemplateOut(CamelModel):
    id: str
    name: str
    category: TemplateCategory
    description: str
    aspect: str
    doc: dict[str, Any]
    created_at: datetime


class TemplateList(CamelModel):
    items: list[TemplateOut]


def _aspect(doc: dict[str, Any]) -> str:
    """The main composition's shape as `w:h` in lowest terms (1080x1920 -> 9:16)."""
    main = next(
        (c for c in doc.get("compositions", []) if c.get("id") == doc.get("mainCompositionId")),
        None,
    )
    if main is None:
        return "16:9"
    w, h = int(main.get("width", 16)), int(main.get("height", 9))
    a, b = w, h
    while b:
        a, b = b, a % b
    return f"{w // a}:{h // a}"


@router.get("", responses=error_responses(401))
async def list_templates(user: CurrentUser, session: SessionDep) -> TemplateList:
    """Templates this user saved, newest first."""
    rows = (
        await session.scalars(
            select(TemplateRecord)
            .where(TemplateRecord.owner_id == user.id)
            .order_by(TemplateRecord.created_at.desc())
        )
    ).all()
    return TemplateList(items=[TemplateOut.model_validate(r, from_attributes=True) for r in rows])


@router.post("", status_code=status.HTTP_201_CREATED, responses=error_responses(401, 413, 422))
async def create_template(
    body: TemplateCreate, user: CurrentUser, session: SessionDep
) -> TemplateOut:
    """Save a project document as a template (its placeholder clips are the slots)."""
    doc = validate_document(body.doc)
    row = TemplateRecord(
        id=new_id(),
        owner_id=user.id,
        name=body.name.strip(),
        category=body.category,
        description=body.description,
        aspect=_aspect(doc),
        doc=doc,
    )
    session.add(row)
    await session.commit()
    log.info("template.created", template_id=row.id)
    return TemplateOut.model_validate(row, from_attributes=True)


@router.delete(
    "/{template_id}", status_code=status.HTTP_204_NO_CONTENT, responses=error_responses(401, 404)
)
async def delete_template(template_id: str, user: CurrentUser, session: SessionDep) -> None:
    """Remove one of your templates (projects made from it are not affected)."""
    row = await session.get(TemplateRecord, template_id)
    if row is None or row.owner_id != user.id:
        raise ApiError(404, "not_found", "This template does not exist or was removed.")
    await session.delete(row)
    await session.commit()
