"""Orchestrates the pipeline for one file: decides the kind, runs the stages, reports progress."""

import json
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

from lumacut_worker.pipeline import image, thumbs, video, waveform
from lumacut_worker.pipeline.errors import ProcessingError
from lumacut_worker.pipeline.probe import MediaProbe, probe_media

# (stage name, overall progress in [0, 1])
ProgressFn = Callable[[str, float], None]

Kind = Literal["video", "audio", "image"]

VIDEO_STAGES = (
    ("probe", 0.02),
    ("proxy", 0.38),
    ("master", 0.40),
    ("thumbnails", 0.12),
    ("waveform", 0.08),
)
VIDEO_ONLY_STAGES = (("probe", 0.02), ("proxy", 0.43), ("master", 0.43), ("thumbnails", 0.12))
AUDIO_STAGES = (("probe", 0.05), ("proxy", 0.40), ("master", 0.35), ("waveform", 0.20))
IMAGE_STAGES = (("image", 1.0),)


@dataclass
class PipelineResult:
    kind: Kind
    # Shapes match packages/schema VideoStreamInfo / AudioStreamInfo / ImageInfo.
    media: dict[str, Any]
    # Rendition name -> local file. "thumbs/<sheet>" entries hold the sprite sheets.
    files: dict[str, Path] = field(default_factory=dict)
    thumb_index: dict[str, Any] | None = None


class StageTracker:
    """Maps per-stage fractions onto overall progress using fixed stage weights."""

    def __init__(self, stages: tuple[tuple[str, float], ...], report: ProgressFn):
        self._stages = stages
        self._report = report
        self._offsets: dict[str, float] = {}
        total = 0.0
        for name, weight in stages:
            self._offsets[name] = total
            total += weight

    def fraction(self, stage: str) -> Callable[[float], None]:
        weight = dict(self._stages)[stage]
        offset = self._offsets[stage]

        def report(fraction: float) -> None:
            self._report(stage, min(1.0, offset + weight * max(0.0, min(1.0, fraction))))

        report(0.0)
        return report

    def run[T](self, stage: str, step: Callable[[Callable[[float], None]], T]) -> T:
        """Run one stage, always reporting it complete (rounding may stop short of 1.0)."""
        report = self.fraction(stage)
        result = step(report)
        report(1.0)
        return result


def _rate(fps: Any) -> dict[str, int]:
    return {"num": fps.numerator, "den": fps.denominator}


def _media(probe: MediaProbe) -> dict[str, Any]:
    media: dict[str, Any] = {}
    if probe.video is not None:
        media["video"] = {
            "width": probe.video.width,
            "height": probe.video.height,
            "fps": _rate(probe.video.fps),
            "durationUs": probe.duration_us,
            "codec": probe.video.codec,
        }
    if probe.audio is not None:
        media["audio"] = {
            "sampleRate": probe.audio.sample_rate,
            "channels": probe.audio.channels,
            "durationUs": probe.duration_us,
            "codec": probe.audio.codec,
        }
    return media


def _check_complete(rendition: Path, expected_us: int) -> None:
    """A truncated source still transcodes, just shorter: catch that as a damaged file."""
    out = probe_media(rendition)
    if out.duration_us < expected_us * 0.95 - 500_000:
        raise ProcessingError(
            "corrupt_file",
            f"decoded {out.duration_us / 1e6:.2f}s of {expected_us / 1e6:.2f}s",
        )


def process_file(src: Path, work: Path, report: ProgressFn) -> PipelineResult:
    work.mkdir(parents=True, exist_ok=True)
    if image.is_image(src):
        tracker = StageTracker(IMAGE_STAGES, report)
        result = tracker.run("image", lambda _: image.process_image(src, work / "image"))
        media: dict[str, Any] = {"image": {"width": result.width, "height": result.height}}
        if result.downscaled_from is not None:
            w, h = result.downscaled_from
            media["downscaledFrom"] = {"width": w, "height": h}
        return PipelineResult(
            kind="image",
            media=media,
            files={
                "normalized": result.normalized,
                "preview": result.preview,
                "thumb": result.thumb,
            },
        )

    probe = probe_media(src)
    if probe.video is not None:
        stages = VIDEO_STAGES if probe.audio is not None else VIDEO_ONLY_STAGES
    else:
        stages = AUDIO_STAGES
    tracker = StageTracker(stages, report)
    tracker.run("probe", lambda _: None)
    media = _media(probe)
    files: dict[str, Path] = {}
    thumb_index: dict[str, Any] | None = None

    if probe.video is not None:
        proxy = work / "proxy.mp4"
        tracker.run("proxy", lambda p: video.make_video(src, proxy, probe, video.PROXY, p))
        _check_complete(proxy, probe.duration_us)
        master = work / "master.mp4"
        tracker.run("master", lambda p: video.make_video(src, master, probe, video.MASTER, p))
        files.update(proxy=proxy, master=master)

        poster = work / "poster.jpg"
        width, height = video.fit_box(probe.video.width, probe.video.height, video.PROXY.box)

        def make_thumbnails(progress: Callable[[float], None]) -> dict[str, Any]:
            thumbs.make_poster(proxy, poster, probe.duration_us)
            return thumbs.make_sprites(
                proxy, work / "thumbs", probe.duration_us, width, height, progress
            )

        thumb_index = tracker.run("thumbnails", make_thumbnails)
        files["poster"] = poster
        for sheet in thumb_index["sheets"]:
            files[f"thumbs/{sheet}"] = work / "thumbs" / sheet
    else:
        proxy = work / "proxy.m4a"
        tracker.run(
            "proxy", lambda p: video.make_audio(src, proxy, probe, master=False, on_progress=p)
        )
        _check_complete(proxy, probe.duration_us)
        master = work / "master.flac"
        tracker.run(
            "master", lambda p: video.make_audio(src, master, probe, master=True, on_progress=p)
        )
        files.update(proxy=proxy, master=master)

    if probe.audio is not None:
        channels = probe.audio.channels
        peaks = tracker.run(
            "waveform", lambda p: waveform.make_waveform(proxy, channels, probe.duration_us, p)
        )
        path = work / "waveform.json"
        path.write_text(json.dumps(peaks, separators=(",", ":")))
        files["waveform"] = path

    kind: Kind = "video" if probe.video is not None else "audio"
    return PipelineResult(kind=kind, media=media, files=files, thumb_index=thumb_index)
