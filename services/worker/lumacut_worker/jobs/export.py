"""RQ job for server exports: the render page draws in headless Chromium, FFmpeg encodes.

Flow: mark the export running → start FFmpeg (frames on stdin) → serve the render page and the
project's media on 127.0.0.1 → the page draws every frame with the editor's engine and POSTs it,
then POSTs the mixed (and loudness-normalised) sound as a WAV → mux → upload → done. Progress and
cancellation are checked as frames arrive; every state change is published for the SSE stream.
"""

from __future__ import annotations

import asyncio
import subprocess
import tempfile
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import structlog
from rq.timeouts import JobTimeoutException
from sqlalchemy import select

from lumacut_core.db import Asset, ExportJob
from lumacut_core.events import ExportStateEvent, user_exports_channel
from lumacut_core.storage import presign_get, upload_file
from lumacut_worker.export.ffmpeg import (
    VideoSpec,
    mp3_command,
    mux_command,
    video_command,
)
from lumacut_worker.export.page import run_page_export
from lumacut_worker.export.server import CancelledError, ExportIntake, ExportServer
from lumacut_worker.jobs.media import JobContext, job_context

log = structlog.get_logger()

EXTENSION = {"mp4": "mp4", "webm": "webm", "gif": "gif", "mp3": "mp3"}
CONTENT_TYPE = {"mp4": "video/mp4", "webm": "video/webm", "gif": "image/gif", "mp3": "audio/mpeg"}
#: Seconds between progress updates (and cancellation checks).
PROGRESS_EVERY_S = 0.5
GIF_MAX_SIDE = 720
GIF_MAX_FPS = 25


def output_size(width: int, height: int, resolution: str, fmt: str) -> tuple[int, int]:
    """Mirrors `outputSize` in packages/engine/src/export/settings.ts (keep them in step)."""
    short = min(width, height)
    scale = 720 / short if resolution == "720p" else 1080 / short if resolution == "1080p" else 1.0
    if fmt == "gif":
        scale = min(scale, GIF_MAX_SIDE / max(width, height))

    def even(n: float) -> int:
        return max(2, 2 * round(n / 2))

    return even(width * scale), even(height * scale)


def frame_count(from_us: int, to_us: int, fps: int) -> int:
    """Mirrors `framePlan(...).count`."""
    return max(1, round((max(0, to_us - from_us) / 1_000_000) * fps))


async def save_export(ctx: JobContext, export_id: str, **changes: Any) -> ExportJob | None:
    """Apply changes and publish the new state. None if the export was removed."""
    async with ctx.sessions() as session:
        row = await session.get(ExportJob, export_id)
        if row is None:
            return None
        for name, value in changes.items():
            setattr(row, name, value)
        await session.commit()
        event = ExportStateEvent(
            export_id=row.id,
            project_id=row.project_id,
            status=row.status,
            progress=row.progress,
            error_message=row.error_message,
        )
        await ctx.redis.publish(
            user_exports_channel(row.owner_id), event.model_dump_json(by_alias=True)
        )
        return row


async def report_progress(ctx: JobContext, export_id: str, progress: float) -> str:
    """Records progress unless the export was cancelled; returns the current status."""
    async with ctx.sessions() as session:
        row = await session.get(ExportJob, export_id)
        if row is None:
            return "cancelled"
        if row.status == "cancelled":
            return "cancelled"
    await save_export(ctx, export_id, progress=progress)
    return "running"


async def media_urls(ctx: JobContext, row: ExportJob) -> dict[str, dict[str, str]]:
    """Presigned (internal endpoint) URLs of every asset the project uses, per kind of file."""
    ids = [a.get("id") for a in row.doc.get("assets", []) if isinstance(a, dict)]
    async with ctx.sessions() as session:
        assets = (
            await session.scalars(
                select(Asset).where(Asset.id.in_([i for i in ids if isinstance(i, str)]))
            )
        ).all()
    bucket = ctx.settings.s3_bucket
    out: dict[str, dict[str, str]] = {}
    for asset in assets:
        if asset.owner_id != row.owner_id or asset.status != "ready":
            continue
        renditions: dict[str, Any] = asset.renditions or {}
        kinds: dict[str, str] = {}
        if asset.kind in ("video", "audio"):
            kinds["original"] = await presign_get(ctx.s3, bucket, asset.original_key)
        for kind, rendition in (
            ("video", "proxy"),
            ("audio", "proxy"),
            ("image", "normalized"),
            ("preview", "preview"),
            ("lut", "lut"),
        ):
            key = renditions.get(rendition)
            if isinstance(key, str):
                kinds[kind] = await presign_get(ctx.s3, bucket, key)
        out[asset.id] = kinds
    return out


def _run_ffmpeg(command: list[str]) -> None:
    done = subprocess.run(command, capture_output=True, check=False)
    if done.returncode != 0:
        tail = done.stderr.decode(errors="replace").strip().splitlines()[-3:]
        raise RuntimeError("FFmpeg failed: " + " / ".join(tail))


async def _export(export_id: str) -> dict[str, Any]:
    async with job_context() as ctx:
        current = await report_progress(ctx, export_id, 0.0)
        if current == "cancelled":
            return {"exportId": export_id, "status": "cancelled"}
        row = await save_export(ctx, export_id, status="running", progress=0.0, error_message=None)
        if row is None:
            return {"exportId": export_id, "status": "deleted"}
        settings: dict[str, Any] = row.settings
        fmt = str(settings["format"])
        comp = next(c for c in row.doc["compositions"] if c["id"] == row.composition_id)
        width, height = output_size(
            int(comp["width"]), int(comp["height"]), str(settings["resolution"]), fmt
        )
        fps = min(int(settings["fps"]), GIF_MAX_FPS) if fmt == "gif" else int(settings["fps"])
        total = frame_count(int(settings["fromUs"]), int(settings["toUs"]), fps)
        quality = settings.get("quality", "high")
        loop = asyncio.get_running_loop()
        log.info(
            "export.start", export_id=export_id, format=fmt, size=f"{width}x{height}", frames=total
        )
        try:
            with tempfile.TemporaryDirectory(prefix="lumacut-export-") as tmp:
                work = Path(tmp)
                silent = work / f"picture.{EXTENSION[fmt]}"
                audio = work / "mix.wav"
                final = work / f"export.{EXTENSION[fmt]}"
                encoder: subprocess.Popen[bytes] | None = None
                if fmt != "mp3":
                    spec = VideoSpec(width, height, fps, quality)
                    command = video_command(fmt, spec, silent)  # type: ignore[arg-type]
                    encoder = await asyncio.to_thread(
                        subprocess.Popen, command, stdin=subprocess.PIPE, stderr=subprocess.PIPE
                    )
                last = {"at": 0.0}
                frame_bytes = width * height * 4

                def on_frame(index: int, data: bytes) -> None:
                    if encoder is None or encoder.stdin is None:
                        raise ValueError("this export has no picture")
                    if len(data) != frame_bytes:
                        raise ValueError(
                            f"frame {index} has {len(data)} bytes, {frame_bytes} expected"
                        )
                    encoder.stdin.write(data)
                    now = time.monotonic()
                    if now - last["at"] >= PROGRESS_EVERY_S or index + 1 == total:
                        last["at"] = now
                        # Drawing is ~90% of the work; muxing and uploading the rest.
                        share = 0.9 * (index + 1) / total
                        status = asyncio.run_coroutine_threadsafe(
                            report_progress(ctx, export_id, share), loop
                        ).result(timeout=30)
                        if status == "cancelled":
                            raise CancelledError

                intake = ExportIntake(
                    on_frame=on_frame,
                    audio_path=audio,
                    media=await media_urls(ctx, row),
                    static_dir=Path(ctx.settings.render_page_dir),
                )
                job = {
                    "project": row.doc,
                    "compositionId": row.composition_id,
                    "settings": settings,
                }
                try:
                    with ExportServer(intake) as server:
                        job["endpoint"] = server.url
                        report = await asyncio.to_thread(run_page_export, server.url, job)
                finally:
                    if encoder is not None and encoder.stdin is not None:
                        encoder.stdin.close()
                if intake.errors:
                    raise RuntimeError(intake.errors[0])
                if encoder is not None:
                    code = await asyncio.to_thread(encoder.wait)
                    if code != 0:
                        err = (
                            encoder.stderr.read().decode(errors="replace") if encoder.stderr else ""
                        )
                        raise RuntimeError("FFmpeg failed: " + err.strip()[-300:])
                if fmt in ("mp4", "webm"):
                    if audio.exists():
                        await asyncio.to_thread(
                            _run_ffmpeg,
                            mux_command(fmt, silent, audio, quality, final),  # type: ignore[arg-type]
                        )
                    else:
                        silent.rename(final)
                elif fmt == "gif":
                    silent.rename(final)
                else:
                    if not audio.exists():
                        raise RuntimeError("The page sent no sound to encode.")
                    await asyncio.to_thread(_run_ffmpeg, mp3_command(audio, final))
                await save_export(ctx, export_id, progress=0.95)
                key = f"users/{row.owner_id}/exports/{row.id}/export.{EXTENSION[fmt]}"
                await upload_file(ctx.s3, ctx.settings.s3_bucket, key, final, CONTENT_TYPE[fmt])
                size = final.stat().st_size
            warnings = [str(w) for w in report.get("warnings", [])][:50]
            await save_export(
                ctx,
                export_id,
                status="done",
                progress=1.0,
                output_key=key,
                size_bytes=size,
                warnings=warnings,
                finished_at=datetime.now(UTC),
            )
            log.info("export.done", export_id=export_id, bytes=size)
            return {"exportId": export_id, "status": "done"}
        except Exception as exc:
            cancelled = await report_progress(ctx, export_id, 0.0) == "cancelled"
            if cancelled:
                log.info("export.cancelled", export_id=export_id)
                await save_export(ctx, export_id, finished_at=datetime.now(UTC))
                return {"exportId": export_id, "status": "cancelled"}
            message = str(exc).split("\n")[0][:500] or "The export failed."
            log.warning("export.failed", export_id=export_id, error=message)
            await save_export(
                ctx,
                export_id,
                status="failed",
                error_message=message,
                finished_at=datetime.now(UTC),
            )
            return {"exportId": export_id, "status": "failed"}


def run_export(export_id: str) -> dict[str, Any]:
    """RQ entry point (enqueued by the API as `lumacut_worker.jobs.export.run_export`)."""
    return asyncio.run(_export(export_id))


async def _mark_failed(export_id: str, message: str) -> None:
    async with job_context() as ctx:
        async with ctx.sessions() as session:
            row = await session.get(ExportJob, export_id)
            if row is None or row.status in ("done", "failed", "cancelled"):
                return
        await save_export(
            ctx, export_id, status="failed", error_message=message, finished_at=datetime.now(UTC)
        )


def on_export_failure(job: Any, connection: Any, exc_type: Any, exc: Any, tb: Any) -> None:
    """RQ failure callback: crashes and timeouts the job itself can't catch."""
    export_id = str(job.args[0]) if job.args else ""
    if not export_id:
        return
    if isinstance(exc, JobTimeoutException) or exc_type is JobTimeoutException:
        message = "The export took too long and was stopped. Try a shorter range or a smaller size."
    else:
        message = "The export stopped unexpectedly. Try again."
    log.error("export.crashed", export_id=export_id, error=repr(exc))
    asyncio.run(_mark_failed(export_id, message))
