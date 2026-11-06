"""Inspection helpers for verifying media files (sample tests and pipeline tests; needs ffmpeg)."""

import json
import subprocess
from fractions import Fraction
from pathlib import Path
from typing import Any


def ffprobe(path: Path, *args: str) -> dict[str, Any]:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-of", "json", *args, str(path)],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    result: dict[str, Any] = json.loads(out)
    return result


def stream(path: Path, kind: str) -> dict[str, Any]:
    streams = ffprobe(path, "-show_streams", "-count_packets")["streams"]
    matches = [s for s in streams if s["codec_type"] == kind]
    if len(matches) != 1:
        raise AssertionError(f"{path.name}: expected one {kind} stream, found {len(matches)}")
    found: dict[str, Any] = matches[0]
    return found


def has_stream(path: Path, kind: str) -> bool:
    return any(s["codec_type"] == kind for s in ffprobe(path, "-show_streams")["streams"])


def video_frame_times_us(path: Path) -> list[int]:
    frames = ffprobe(path, "-select_streams", "v:0", "-show_entries", "packet=pts_time,flags")
    pts = sorted(Fraction(p["pts_time"]) for p in frames["packets"])
    return [round(t * 1_000_000) for t in pts]


def keyframe_indices(path: Path) -> list[int]:
    packets = ffprobe(path, "-select_streams", "v:0", "-show_entries", "packet=pts_time,flags")
    ordered = sorted(packets["packets"], key=lambda p: Fraction(p["pts_time"]))
    return [i for i, p in enumerate(ordered) if "K" in p["flags"]]


def decode_gray_frame(path: Path, index: int) -> bytes:
    """Frame `index` (decode order = presentation order for our closed-GOP files) as 8-bit luma."""
    return subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            str(path),
            "-vf",
            f"select=eq(n\\,{index})",
            "-frames:v",
            "1",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "gray",
            "-",
        ],
        capture_output=True,
        check=True,
    ).stdout


def decode_mono_pcm(path: Path) -> list[int]:
    raw = subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            str(path),
            "-ac",
            "1",
            "-ar",
            "48000",
            "-f",
            "s16le",
            "-acodec",
            "pcm_s16le",
            "-",
        ],
        capture_output=True,
        check=True,
    ).stdout
    return [int.from_bytes(raw[i : i + 2], "little", signed=True) for i in range(0, len(raw), 2)]


def onset_s(samples: list[int], around_s: float, window_s: float = 0.1) -> float:
    """First sample above a beep threshold within ±window of `around_s`, in seconds."""
    lo = max(0, int((around_s - window_s) * 48000))
    hi = int((around_s + window_s) * 48000)
    for i in range(lo, min(hi, len(samples))):
        if abs(samples[i]) > 3000:
            return i / 48000
    raise AssertionError(f"no onset found near {around_s}s")


def top_level_atoms(path: Path) -> list[str]:
    """MP4 box types in file order (to check `moov` precedes `mdat`, i.e. faststart)."""
    atoms: list[str] = []
    with path.open("rb") as f:
        while header := f.read(8):
            if len(header) < 8:
                break
            size = int.from_bytes(header[:4], "big")
            atoms.append(header[4:8].decode("latin-1"))
            if size == 1:
                size = int.from_bytes(f.read(8), "big")
                f.seek(size - 16, 1)
            elif size == 0:
                break
            else:
                f.seek(size - 8, 1)
    return atoms


def decode_all_barcodes(path: Path, width: int, height: int) -> list[int]:
    """Frame number burned into every frame of `path`, in presentation order (one ffmpeg run).

    Only the barcode row is extracted per frame, so this is cheap even for long files.
    """
    from lumacut_worker.samples import barcode

    row_y = height - barcode.strip_height(height) // 2
    raw = subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            str(path),
            "-vf",
            f"format=gray,crop={width}:1:0:{row_y}",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "gray",
            "-",
        ],
        capture_output=True,
        check=True,
    ).stdout
    return [barcode.decode_row(raw[i : i + width]) for i in range(0, len(raw), width)]
