"""Proxy (editing) and master (export) renditions."""

import math
from dataclasses import dataclass
from fractions import Fraction
from pathlib import Path

from lumacut_worker.pipeline.ffmpeg import FractionFn, run_ffmpeg
from lumacut_worker.pipeline.probe import MediaProbe


@dataclass(frozen=True)
class RenditionSpec:
    box: tuple[int, int]  # landscape bounding box; portrait sources use it transposed
    crf: int
    preset: str
    gop_seconds: Fraction
    audio_bitrate: str


PROXY = RenditionSpec(
    box=(1280, 720), crf=23, preset="veryfast", gop_seconds=Fraction(1, 2), audio_bitrate="128k"
)
MASTER = RenditionSpec(
    box=(1920, 1080), crf=18, preset="faster", gop_seconds=Fraction(1), audio_bitrate="256k"
)


def fit_box(width: int, height: int, box: tuple[int, int]) -> tuple[int, int]:
    """Largest even size with the same aspect that fits the box (transposed for portrait);
    never upscales."""
    long_side, short_side = max(box), min(box)
    max_w, max_h = (long_side, short_side) if width >= height else (short_side, long_side)
    scale = min(1.0, max_w / width, max_h / height)

    def even(v: float) -> int:
        return max(2, round(v / 2) * 2)

    return even(width * scale), even(height * scale)


def gop_frames(fps: Fraction, seconds: Fraction) -> int:
    return max(1, math.ceil(fps * seconds))


def video_args(src: Path, out: Path, probe: MediaProbe, spec: RenditionSpec) -> list[str]:
    assert probe.video is not None
    v = probe.video
    width, height = fit_box(v.width, v.height, spec.box)
    rate = f"{v.fps.numerator}/{v.fps.denominator}"
    gop = gop_frames(v.fps, spec.gop_seconds)
    vf = (
        f"fps={rate}:round=near,"
        f"scale={width}:{height}:flags=lanczos:out_color_matrix=bt709:out_range=tv,"
        "setsar=1,format=yuv420p"
    )
    args = [
        "-i",
        str(src),
        "-map",
        "0:v:0",
        "-vf",
        vf,
        "-c:v",
        "libx264",
        "-preset",
        spec.preset,
        "-crf",
        str(spec.crf),
        "-profile:v",
        "high",
        "-g",
        str(gop),
        "-keyint_min",
        str(gop),
        "-sc_threshold",
        "0",
        "-x264-params",
        "open-gop=0",
        "-colorspace",
        "bt709",
        "-color_primaries",
        "bt709",
        "-color_trc",
        "bt709",
        "-color_range",
        "tv",
    ]
    if probe.audio is not None:
        args += [
            "-map",
            "0:a:0",
            "-c:a",
            "aac",
            "-b:a",
            spec.audio_bitrate,
            "-ar",
            "48000",
            "-ac",
            "2",
        ]
    return [*args, "-movflags", "+faststart", "-map_metadata", "-1", str(out)]


def audio_proxy_args(src: Path, out: Path) -> list[str]:
    return [
        "-i",
        str(src),
        "-map",
        "0:a:0",
        "-vn",
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        "-ar",
        "48000",
        "-ac",
        "2",
        "-movflags",
        "+faststart",
        "-map_metadata",
        "-1",
        str(out),
    ]


def audio_master_args(src: Path, out: Path) -> list[str]:
    return [
        "-i",
        str(src),
        "-map",
        "0:a:0",
        "-vn",
        "-c:a",
        "flac",
        "-ar",
        "48000",
        "-ac",
        "2",
        "-map_metadata",
        "-1",
        str(out),
    ]


def make_video(
    src: Path, out: Path, probe: MediaProbe, spec: RenditionSpec, on_progress: FractionFn
) -> None:
    run_ffmpeg(video_args(src, out, probe, spec), probe.duration_us, on_progress)


def make_audio(
    src: Path, out: Path, probe: MediaProbe, *, master: bool, on_progress: FractionFn
) -> None:
    args = audio_master_args(src, out) if master else audio_proxy_args(src, out)
    run_ffmpeg(args, probe.duration_us, on_progress)
