"""FFmpeg command lines for server exports (frames arrive as raw RGBA on stdin)."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

Format = Literal["mp4", "webm", "gif", "mp3"]
Quality = Literal["high", "medium", "small"]

#: x264 constant-rate factors (lower is better); VP9 uses bitrate.
CRF: dict[Quality, int] = {"high": 18, "medium": 21, "small": 24}
BITS_PER_PIXEL: dict[Quality, float] = {"high": 0.12, "medium": 0.07, "small": 0.04}
AUDIO_BITRATE: dict[Quality, str] = {"high": "256k", "medium": "192k", "small": "128k"}


@dataclass(frozen=True)
class VideoSpec:
    width: int
    height: int
    fps: int
    quality: Quality


def _raw_input(spec: VideoSpec) -> list[str]:
    return [
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgba",
        "-s",
        f"{spec.width}x{spec.height}",
        "-framerate",
        str(spec.fps),
        "-i",
        "pipe:0",
    ]


def video_command(fmt: Format, spec: VideoSpec, out: Path) -> list[str]:
    """Encode piped frames to a silent video (MP4/H.264 or WebM/VP9) or a GIF."""
    base = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *_raw_input(spec)]
    if fmt == "mp4":
        return [
            *base,
            "-an",
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            str(CRF[spec.quality]),
            "-profile:v",
            "high",
            "-pix_fmt",
            "yuv420p",
            "-g",
            str(spec.fps * 2),
            "-movflags",
            "+faststart",
            str(out),
        ]
    if fmt == "webm":
        bitrate = int(spec.width * spec.height * spec.fps * BITS_PER_PIXEL[spec.quality] * 0.7)
        return [
            *base,
            "-an",
            "-c:v",
            "libvpx-vp9",
            "-b:v",
            str(max(500_000, bitrate)),
            "-row-mt",
            "1",
            "-deadline",
            "good",
            "-cpu-used",
            "4",
            "-pix_fmt",
            "yuv420p",
            str(out),
        ]
    if fmt == "gif":
        # One pass: a palette made from the clip itself, then used to dither it.
        return [
            *base,
            "-filter_complex",
            "[0:v]split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a",
            "-loop",
            "0",
            str(out),
        ]
    raise ValueError(f"{fmt} has no picture")


def mux_command(fmt: Format, video: Path, audio: Path, quality: Quality, out: Path) -> list[str]:
    """Add the mix to a silent video (the picture is copied, not re-encoded)."""
    codec = (
        ["-c:a", "aac", "-b:a", AUDIO_BITRATE[quality]]
        if fmt == "mp4"
        else [
            "-c:a",
            "libopus",
            "-b:a",
            AUDIO_BITRATE[quality],
        ]
    )
    extra = ["-movflags", "+faststart"] if fmt == "mp4" else []
    return [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        str(video),
        "-i",
        str(audio),
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-c:v",
        "copy",
        *codec,
        *extra,
        str(out),
    ]


def mp3_command(audio: Path, out: Path) -> list[str]:
    """The mix as MP3 (LAME VBR ~190 kb/s)."""
    return [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        str(audio),
        "-c:a",
        "libmp3lame",
        "-q:a",
        "2",
        str(out),
    ]
