"""Server exports: request/response models, job enqueueing and state events."""

from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Literal

from pydantic import Field, model_validator
from redis.asyncio import Redis as AsyncRedis
from rq import Callback, Queue

from lumacut_core.camel import CamelModel
from lumacut_core.db import ExportJob
from lumacut_core.events import ExportStateEvent, ExportStatus, user_exports_channel

EXPORT_JOB = "lumacut_worker.jobs.export.run_export"
EXPORT_FAILURE_CALLBACK = "lumacut_worker.jobs.export.on_export_failure"
#: Longest export the server takes (SPEC has no cap; this bounds a runaway job).
MAX_EXPORT_US = 4 * 3600 * 1_000_000
#: GIFs are short (SPEC §11).
MAX_GIF_US = 15 * 1_000_000

ExportFormat = Literal["mp4", "webm", "gif", "mp3"]


class ExportSettingsIn(CamelModel):
    """What to make; mirrors `ExportSettings` in packages/engine/src/export/settings.ts."""

    format: ExportFormat
    resolution: Literal["720p", "1080p", "source"] = "1080p"
    fps: Literal[24, 25, 30, 60] = 30
    quality: Literal["high", "medium", "small"] = "high"
    from_us: int = Field(ge=0)
    to_us: int = Field(gt=0)
    loudness: Literal["social", "broadcast", "none"] = "none"

    @model_validator(mode="after")
    def _check_range(self) -> ExportSettingsIn:
        if self.to_us <= self.from_us:
            raise ValueError("toUs must be after fromUs")
        if self.to_us - self.from_us > MAX_EXPORT_US:
            raise ValueError("an export can be at most 4 hours long")
        if self.format == "gif" and self.to_us - self.from_us > MAX_GIF_US:
            raise ValueError("a GIF can be at most 15 seconds long")
        return self


class ExportCreate(CamelModel):
    project_id: str
    composition_id: str
    settings: ExportSettingsIn
    name: str | None = Field(default=None, max_length=255)


class ExportOut(CamelModel):
    id: str
    project_id: str
    composition_id: str
    name: str
    settings: ExportSettingsIn
    status: ExportStatus
    progress: float
    error_message: str | None
    warnings: list[str]
    size_bytes: int | None
    created_at: datetime
    finished_at: datetime | None
    #: Presigned download link once the file is ready.
    download_url: str | None = None


class ExportList(CamelModel):
    items: list[ExportOut]


EXTENSION = {"mp4": "mp4", "webm": "webm", "gif": "gif", "mp3": "mp3"}
CONTENT_TYPE = {"mp4": "video/mp4", "webm": "video/webm", "gif": "image/gif", "mp3": "audio/mpeg"}


def export_key(owner_id: str, export_id: str, fmt: str) -> str:
    return f"users/{owner_id}/exports/{export_id}/export.{EXTENSION.get(fmt, 'bin')}"


def job_timeout_s(settings: ExportSettingsIn) -> int:
    """Generous budget: software rendering runs at a few frames per second (30 min + 2 s per second
    of output per output frame rate step)."""
    seconds = (settings.to_us - settings.from_us) / 1_000_000
    return int(1800 + seconds * settings.fps * 1.0)


def state_event(row: ExportJob, *, deleted: bool = False) -> ExportStateEvent:
    return ExportStateEvent(
        export_id=row.id,
        project_id=row.project_id,
        status=row.status,
        progress=row.progress,
        error_message=row.error_message,
        deleted=deleted,
    )


async def publish_state(redis: AsyncRedis, row: ExportJob, *, deleted: bool = False) -> None:
    event = state_event(row, deleted=deleted)
    await redis.publish(user_exports_channel(row.owner_id), event.model_dump_json(by_alias=True))


async def enqueue_export(queue: Queue, row: ExportJob) -> None:
    settings = ExportSettingsIn.model_validate(row.settings)
    await asyncio.to_thread(
        queue.enqueue,
        EXPORT_JOB,
        row.id,
        job_id=f"export-{row.id}",
        job_timeout=job_timeout_s(settings),
        on_failure=Callback(EXPORT_FAILURE_CALLBACK),
        result_ttl=3600,
        failure_ttl=7 * 24 * 3600,
    )
