"""Waveform peaks in the audiowaveform JSON v2 format (BBC audiowaveform), streamed via numpy."""

import subprocess
import tempfile
from collections.abc import Iterable, Iterator
from pathlib import Path
from typing import Any

import numpy as np
import numpy.typing as npt

from lumacut_worker.pipeline.errors import ProcessingError
from lumacut_worker.pipeline.ffmpeg import FractionFn

SAMPLE_RATE = 48_000
SAMPLES_PER_PIXEL = 480  # 100 peaks per second
CHUNK_PIXELS = 4096


def peaks_from_chunks(
    chunks: Iterable[npt.NDArray[np.float32]],
    channels: int,
    samples_per_pixel: int = SAMPLES_PER_PIXEL,
) -> npt.NDArray[np.int8]:
    """Interleaved float32 PCM chunks → int8 [min, max] per channel per pixel (v2 layout:
    pixel-major, then channel)."""
    frame_size = samples_per_pixel * channels
    carry = np.empty(0, dtype=np.float32)
    out: list[npt.NDArray[np.int8]] = []

    def emit(block: npt.NDArray[np.float32]) -> None:
        frames = block.reshape(-1, samples_per_pixel, channels)
        mins, maxs = frames.min(axis=1), frames.max(axis=1)  # (pixels, channels)
        pairs = np.stack([mins, maxs], axis=2).reshape(len(frames), channels * 2)
        out.append(np.clip(np.round(pairs * 127), -128, 127).astype(np.int8))

    for chunk in chunks:
        data = np.concatenate([carry, chunk]) if carry.size else chunk
        usable = len(data) - len(data) % frame_size
        if usable:
            emit(data[:usable])
        carry = data[usable:]
    if carry.size:
        whole = len(carry) - len(carry) % channels
        padded = np.zeros(frame_size, dtype=np.float32)
        padded[:whole] = carry[:whole]
        # Pad with the last real sample per channel so silence padding can't widen the peaks.
        if whole:
            tail = carry[whole - channels : whole]
            padded[whole:] = np.tile(tail, (frame_size - whole) // channels)
        emit(padded)
    if not out:
        return np.empty(0, dtype=np.int8)
    return np.concatenate(out).reshape(-1)


def _pcm_chunks(
    src: Path, channels: int, duration_us: int, on_progress: FractionFn
) -> Iterator[npt.NDArray[np.float32]]:
    cmd = [
        "ffmpeg", "-hide_banner", "-nostdin", "-loglevel", "error", "-i", str(src),
        "-map", "0:a:0", "-vn", "-ac", str(channels), "-ar", str(SAMPLE_RATE), "-f", "f32le", "-",
    ]  # fmt: skip
    chunk_bytes = CHUNK_PIXELS * SAMPLES_PER_PIXEL * channels * 4
    total_samples = max(1, duration_us * SAMPLE_RATE // 1_000_000)
    seen = 0
    # Context managers close both pipes even if the consumer stops iterating early.
    with (
        tempfile.TemporaryFile() as stderr,
        subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=stderr) as proc,
    ):
        assert proc.stdout is not None
        while chunk := proc.stdout.read(chunk_bytes):
            usable = len(chunk) - len(chunk) % 4
            samples = np.frombuffer(chunk[:usable], dtype=np.float32)
            seen += len(samples) // channels
            on_progress(min(1.0, seen / total_samples))
            yield samples
        if proc.wait() != 0:
            stderr.seek(0)
            raise ProcessingError("corrupt_file", stderr.read().decode(errors="replace")[-500:])


def make_waveform(
    src: Path, source_channels: int, duration_us: int, on_progress: FractionFn
) -> dict[str, Any]:
    channels = 1 if source_channels == 1 else 2
    data = peaks_from_chunks(_pcm_chunks(src, channels, duration_us, on_progress), channels)
    return {
        "version": 2,
        "channels": channels,
        "sample_rate": SAMPLE_RATE,
        "samples_per_pixel": SAMPLES_PER_PIXEL,
        "bits": 8,
        "length": len(data) // (2 * channels),
        "data": data.tolist(),
    }
