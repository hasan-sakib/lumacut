"""Media for `make perf` (the M2 playback benchmark): real M1 renditions of the 1080p samples.

The engine plays what the library stores: a proxy of at most 720p for video, the normalized copy for
images. This runs the production pipeline over the sample files so the benchmark decodes exactly
those, and records each asset's *declared* size (the original's, which clip transforms are authored
against) next to the rendition it reads.
"""

import json
import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import structlog

from lumacut_worker.pipeline.process import process_file

log = structlog.get_logger()


@dataclass(frozen=True)
class PerfSource:
    source: str
    name: str  # output file stem


PERF_SOURCES: tuple[PerfSource, ...] = (
    PerfSource("fn_1080p30.mp4", "perf_v1"),
    PerfSource("fn_1080p60.mp4", "perf_v2"),
    PerfSource("fn_720p24.mp4", "perf_v3"),
    PerfSource("img_alpha_2048.png", "perf_i1"),
    PerfSource("img_1920x1080.webp", "perf_i2"),
)

MANIFEST_NAME = "perf-media.json"


def _entry(spec: PerfSource, kind: str, media: dict[str, Any], file: Path) -> dict[str, Any]:
    entry: dict[str, Any] = {"id": spec.name, "source": spec.source, "kind": kind, "file": file.name}
    if kind == "video":
        entry["width"] = media["video"]["width"]
        entry["height"] = media["video"]["height"]
        entry["fps"] = media["video"]["fps"]
        entry["durationUs"] = media["video"]["durationUs"]
    else:
        entry["width"] = media["image"]["width"]
        entry["height"] = media["image"]["height"]
    return entry


def generate_perf_media(samples_dir: Path, out_dir: Path) -> dict[str, Any]:
    """Process each perf source from `samples_dir` into `out_dir` and write the manifest."""
    out_dir.mkdir(parents=True, exist_ok=True)
    entries: list[dict[str, Any]] = []
    for spec in PERF_SOURCES:
        src = samples_dir / spec.source
        if not src.is_file():
            raise FileNotFoundError(f"{src} is missing: run `make samples` first")
        log.info("perf_media.generate", source=spec.source)
        with tempfile.TemporaryDirectory(prefix="lumacut-perf-") as tmp:
            result = process_file(src, Path(tmp), lambda _s, _p: None)
            rendition = result.files["proxy" if result.kind == "video" else "normalized"]
            dest = out_dir / f"{spec.name}{rendition.suffix}"
            shutil.copyfile(rendition, dest)
        entries.append(_entry(spec, result.kind, result.media, dest))
    manifest = {"generator": "lumacut_worker.samples.perf_media", "files": entries}
    (out_dir / MANIFEST_NAME).write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest
