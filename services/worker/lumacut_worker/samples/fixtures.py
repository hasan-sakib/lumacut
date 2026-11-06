"""Small committed fixtures for the engine's browser tests (`make fixtures`).

Every fixture carries the frame-number barcode and a 1 kHz beep at each whole second. Most are
produced by the real M1 proxy pipeline (so they have the exact structure the engine will read in
production: CFR, closed 0.5 s GOP, AAC 48 kHz). `fx_long_gop` is encoded directly because the
pipeline never produces a long GOP; it exists to prove seeking works from a distant keyframe.

`manifest.json` records ground truth for tests: frame count, rational fps, and the barcode each
frame actually shows (`"identity"` when frame n shows n).
"""

import json
import shutil
import tempfile
from dataclasses import dataclass
from fractions import Fraction
from pathlib import Path
from typing import Any

import structlog

from lumacut_worker.pipeline.process import process_file
from lumacut_worker.samples.generate import sha256, video_command
from lumacut_worker.samples.media_check import decode_all_barcodes, stream
from lumacut_worker.samples.specs import VideoSpec

log = structlog.get_logger()


@dataclass(frozen=True)
class FixtureSpec:
    name: str
    source: VideoSpec
    via_pipeline: bool = True


def _source(name: str, w: int, h: int, fps: Fraction, seconds: int, **kw: Any) -> VideoSpec:
    return VideoSpec(f"src_{name}.mp4", w, h, fps, seconds, **kw)


ENGINE_FIXTURES: tuple[FixtureSpec, ...] = (
    FixtureSpec("fx_24.mp4", _source("24", 320, 180, Fraction(24), 4, purpose="24 fps")),
    FixtureSpec("fx_25.mp4", _source("25", 320, 180, Fraction(25), 4, purpose="25 fps")),
    FixtureSpec(
        "fx_2997.mp4",
        _source("2997", 320, 180, Fraction(30000, 1001), 4, purpose="NTSC rounding"),
    ),
    FixtureSpec("fx_30.mp4", _source("30", 320, 180, Fraction(30), 4, purpose="30 fps")),
    FixtureSpec("fx_60.mp4", _source("60", 320, 180, Fraction(60), 3, purpose="60 fps")),
    FixtureSpec(
        "fx_portrait_30.mp4", _source("portrait", 180, 320, Fraction(30), 3, purpose="9:16")
    ),
    FixtureSpec(
        "fx_vfr.mp4",
        _source("vfr", 320, 180, Fraction(30), 4, vfr_drop_every=7, purpose="VFR source -> CFR"),
    ),
    FixtureSpec(
        "fx_long_gop.mp4",
        _source("long_gop", 320, 180, Fraction(30), 4, gop_frames=120, purpose="one keyframe"),
        via_pipeline=False,
    ),
)


def _entry(spec: FixtureSpec, path: Path) -> dict[str, Any]:
    v = stream(path, "video")
    fps = Fraction(v["r_frame_rate"])
    width, height = int(v["width"]), int(v["height"])
    barcodes = decode_all_barcodes(path, width, height)
    frames = int(v["nb_read_packets"])
    if len(barcodes) != frames:
        raise RuntimeError(f"{spec.name}: decoded {len(barcodes)} barcodes for {frames} frames")
    identity = barcodes == list(range(frames))
    seconds = int(float(v["duration"]) + 0.5)
    return {
        "file": spec.name,
        "sha256": sha256(path),
        "bytes": path.stat().st_size,
        "width": width,
        "height": height,
        "fps": {"num": fps.numerator, "den": fps.denominator},
        "frames": frames,
        "gop": spec.source.gop if not spec.via_pipeline else None,
        "via": "pipeline" if spec.via_pipeline else "direct",
        "hasAudio": True,
        "beepsAtS": list(range(seconds)),
        "barcodes": "identity" if identity else barcodes,
        "purpose": spec.source.purpose,
    }


def generate_fixtures(out_dir: Path) -> dict[str, Any]:
    """Regenerate every fixture into out_dir and write out_dir/manifest.json."""
    import subprocess

    out_dir.mkdir(parents=True, exist_ok=True)
    entries = []
    for spec in ENGINE_FIXTURES:
        log.info("fixtures.generate", file=spec.name)
        with tempfile.TemporaryDirectory(prefix="lumacut-fx-") as tmp:
            src = Path(tmp) / spec.source.name
            subprocess.run(video_command(spec.source, src), check=True)
            dest = out_dir / spec.name
            if spec.via_pipeline:
                result = process_file(src, Path(tmp) / "work", lambda _s, _p: None)
                shutil.copyfile(result.files["proxy"], dest)
            else:
                shutil.copyfile(src, dest)
        entries.append(_entry(spec, dest))
    manifest = {"generator": "lumacut_worker.samples.fixtures", "files": entries}
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest
