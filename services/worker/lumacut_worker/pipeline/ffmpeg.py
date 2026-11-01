"""Running ffmpeg/ffprobe with progress reporting and useful errors."""

import json
import subprocess
import tempfile
from collections.abc import Callable
from pathlib import Path
from typing import Any

from lumacut_worker.pipeline.errors import ProcessingError

# Progress callback: fraction of this ffmpeg run that is done, in [0, 1].
FractionFn = Callable[[float], None]

CORRUPT_MARKERS = (
    "moov atom not found",
    "partial file",
    "invalid nal unit",
    "error while decoding",
    "corrupt",
    "truncated",
    "end of file",
)


def parse_progress_line(line: str, duration_us: int) -> float | None:
    """Fraction done from one `-progress` line (`out_time_us=...`), or None for other keys."""
    key, _, value = line.strip().partition("=")
    if key == "progress" and value == "end":
        return 1.0
    if key in ("out_time_us", "out_time_ms") and duration_us > 0:  # both are microseconds
        try:
            done = int(value)
        except ValueError:
            return None
        return min(1.0, max(0.0, done / duration_us))
    return None


def classify_failure(stderr: str) -> ProcessingError:
    lowered = stderr.lower()
    if "invalid data found when processing input" in lowered:
        return ProcessingError("unsupported_format", stderr[-500:])
    if any(marker in lowered for marker in CORRUPT_MARKERS):
        return ProcessingError("corrupt_file", stderr[-500:])
    return ProcessingError("processing_failed", stderr[-500:])


def run_ffmpeg(
    args: list[str], duration_us: int = 0, on_progress: FractionFn | None = None
) -> None:
    """Run ffmpeg (args without the program name); raise ProcessingError on failure."""
    cmd = ["ffmpeg", "-hide_banner", "-nostdin", "-y", "-loglevel", "error"]
    if on_progress is not None:
        cmd += ["-progress", "pipe:1", "-nostats"]
    cmd += args
    with (
        tempfile.TemporaryFile(mode="w+") as stderr,
        subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=stderr, text=True) as proc,
    ):
        assert proc.stdout is not None
        for line in proc.stdout:
            if on_progress is not None:
                fraction = parse_progress_line(line, duration_us)
                if fraction is not None:
                    on_progress(fraction)
        code = proc.wait()
        stderr.seek(0)
        message = stderr.read()
    if code != 0:
        raise classify_failure(message)


def ffprobe_json(path: Path) -> dict[str, Any]:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-of", "json", "-show_format", "-show_streams", str(path)],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise classify_failure(result.stderr or "ffprobe failed")
    data: dict[str, Any] = json.loads(result.stdout or "{}")
    return data
