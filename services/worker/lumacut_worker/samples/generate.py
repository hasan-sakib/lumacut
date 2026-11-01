"""Builds FFmpeg commands for the sample specs and writes the manifest.

Encodes are single-threaded with bit-exact flags, so the same FFmpeg build reproduces
byte-identical files (the manifest records sha256 for each).
"""

import hashlib
import json
import subprocess
from dataclasses import asdict
from pathlib import Path
from typing import Any

import structlog

from lumacut_worker.samples import barcode
from lumacut_worker.samples.specs import (
    AUDIOS,
    BEEP_EXPR,
    IMAGES,
    VIDEOS,
    AudioSpec,
    ImageSpec,
    VideoSpec,
)

log = structlog.get_logger()

FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"
BITEXACT = ["-fflags", "+bitexact", "-flags:v", "+bitexact", "-flags:a", "+bitexact"]
BASE = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y"]


def video_command(spec: VideoSpec, out: Path) -> list[str]:
    w, h, fps = spec.width, spec.height, spec.fps
    bh = barcode.strip_height(h)
    rate = f"{fps.numerator}/{fps.denominator}"
    label_size = h // 6
    graph = (
        f"testsrc2=size={w}x{h}:rate={rate}:duration={spec.duration_s}[base];"
        f"color=c=black:size={w}x{bh}:rate={rate}:duration={spec.duration_s},format=gray,"
        f"geq=lum='{barcode.geq_luma_expression()}'[bar];"
        f"[base][bar]overlay=0:{h - bh}:format=auto,"
        f"drawtext=fontfile={FONT}:text='%{{frame_num}}':fontsize={label_size}:fontcolor=white:"
        f"box=1:boxcolor=black@0.6:boxborderw={label_size // 8}:x=(w-tw)/2:y=(h-th)/2,"
        f"drawtext=fontfile={FONT}:text='%{{pts\\:hms}}  {rate} fps  {w}x{h}':"
        f"fontsize={h // 24}:fontcolor=white:box=1:boxcolor=black@0.6:x=24:y=24"
    )
    if spec.vfr_drop_every is not None:
        k = spec.vfr_drop_every
        graph += f",select='not(eq(mod(n\\,{k})\\,{k // 2}))'"
    graph += ",format=yuv420p[v]"

    cmd = [*BASE, "-filter_complex", graph]
    if spec.beeps:
        cmd += [
            "-f",
            "lavfi",
            "-i",
            f"aevalsrc='{BEEP_EXPR}|{BEEP_EXPR}':s=48000:d={spec.duration_s}",
        ]
    cmd += ["-map", "[v]"]
    if spec.beeps:
        cmd += ["-map", "0:a", "-c:a", "aac", "-b:a", "128k"]
    if spec.codec == "h264":
        cmd += [
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "18",
            "-x264-params",
            f"threads=1:keyint={spec.gop}:min-keyint={spec.gop}:scenecut=0",
        ]
    else:
        cmd += [
            "-c:v",
            "libx265",
            "-preset",
            "veryfast",
            "-crf",
            "22",
            "-tag:v",
            "hvc1",
            "-x265-params",
            f"pools=none:frame-threads=1:keyint={spec.gop}:min-keyint={spec.gop}:scenecut=0:log-level=error",
        ]
    if spec.vfr_drop_every is not None:
        cmd += ["-fps_mode", "vfr"]
    cmd += [*BITEXACT, "-map_metadata", "-1", "-movflags", "+faststart", str(out)]
    return cmd


def audio_command(spec: AudioSpec, out: Path) -> list[str]:
    expr = "|".join([spec.expression] * spec.channels)
    cmd = [
        *BASE,
        "-f",
        "lavfi",
        "-i",
        f"aevalsrc='{expr}':s={spec.sample_rate}:d={spec.duration_s}",
    ]
    if spec.codec == "mp3":
        cmd += ["-c:a", "libmp3lame", "-b:a", "192k"]
    else:
        cmd += ["-c:a", "pcm_s16le"]
    return [*cmd, *BITEXACT, "-map_metadata", "-1", str(out)]


def image_command(spec: ImageSpec, out: Path) -> list[str]:
    w, h = spec.width, spec.height
    if spec.alpha:
        graph = (
            f"color=c=black:size={w}x{h}:duration=1,format=rgba,"
            "geq=r='255*X/W':g='255*Y/H':b='128':"
            "a='255*clip(1-hypot(X-W/2,Y-H/2)/(W/2),0,1)'"
        )
    else:
        cell = max(w, h) // 32
        graph = (
            f"testsrc2=size={w}x{h}:rate=1:duration=1,drawgrid=w={cell}:h={cell}:t=2:c=white@0.5"
        )
    cmd = [*BASE, "-f", "lavfi", "-i", graph, "-frames:v", "1"]
    if spec.codec == "mjpeg":
        cmd += ["-c:v", "mjpeg", "-q:v", "2", "-pix_fmt", "yuvj444p"]
    elif spec.codec == "webp":
        cmd += ["-c:v", "libwebp", "-quality", "85", "-threads", "1"]
    else:
        cmd += ["-c:v", "png", "-pix_fmt", "rgba" if spec.alpha else "rgb24"]
    return [*cmd, *BITEXACT, "-update", "1", str(out)]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _spec_record(spec: VideoSpec | AudioSpec | ImageSpec) -> dict[str, Any]:
    record = asdict(spec)
    if isinstance(spec, VideoSpec):
        record["fps"] = f"{spec.fps.numerator}/{spec.fps.denominator}"
        record["gop_frames"] = spec.gop
        record["frames"] = spec.frames
    return record


def commands(out_dir: Path) -> list[tuple[VideoSpec | AudioSpec | ImageSpec, list[str]]]:
    jobs: list[tuple[VideoSpec | AudioSpec | ImageSpec, list[str]]] = []
    jobs += [(v, video_command(v, out_dir / v.name)) for v in VIDEOS]
    jobs += [(a, audio_command(a, out_dir / a.name)) for a in AUDIOS]
    jobs += [(i, image_command(i, out_dir / i.name)) for i in IMAGES]
    return jobs


def generate(out_dir: Path) -> dict[str, Any]:
    """Generate every sample into out_dir and write out_dir/manifest.json."""
    out_dir.mkdir(parents=True, exist_ok=True)
    entries = []
    for spec, cmd in commands(out_dir):
        log.info("samples.generate", file=spec.name)
        subprocess.run(cmd, check=True)
        kind = {VideoSpec: "video", AudioSpec: "audio", ImageSpec: "image"}[type(spec)]
        entries.append(
            {
                "kind": kind,
                "file": spec.name,
                "sha256": sha256(out_dir / spec.name),
                "spec": _spec_record(spec),
            }
        )
    manifest = {
        "generator": "lumacut_worker.samples",
        "barcode": {
            "cells": barcode.CELLS,
            "bits": barcode.BITS,
            "strip_fraction": barcode.STRIP_FRACTION,
        },
        "files": entries,
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest
