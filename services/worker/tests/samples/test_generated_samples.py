"""Verifies the files produced by `make samples` (run inside the worker image: `make test-samples`).

Checks every file against the spec it was generated from: container properties via ffprobe,
exact rational frame rates and frame timing, keyframe spacing, the burned-in frame-number
barcode, audio beep onsets (A/V sync), silence gaps, and byte-for-byte reproducibility.
"""

import itertools
import json
import os
import subprocess
from fractions import Fraction
from pathlib import Path
from typing import Any

import pytest

from lumacut_worker.samples import barcode
from lumacut_worker.samples.generate import (
    audio_command,
    image_command,
    sha256,
    video_command,
)
from lumacut_worker.samples.specs import (
    AUDIOS,
    IMAGES,
    VIDEOS,
    AudioSpec,
    ImageSpec,
    VideoSpec,
    frame_start_us,
)

pytestmark = pytest.mark.samples

SAMPLES = Path(os.environ.get("LUMACUT_SAMPLES_DIR", "/samples"))
CFR_VIDEOS = [v for v in VIDEOS if v.vfr_drop_every is None]


def spec_id(spec: VideoSpec | AudioSpec | ImageSpec) -> str:
    return spec.name


@pytest.fixture(scope="module")
def manifest() -> dict[str, Any]:
    path = SAMPLES / "manifest.json"
    assert path.exists(), f"{path} not found: run `make samples` first"
    data: dict[str, Any] = json.loads(path.read_text())
    return data


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
    assert len(matches) == 1, f"{path.name}: expected one {kind} stream"
    found: dict[str, Any] = matches[0]
    return found


def video_frame_times_us(path: Path) -> list[int]:
    frames = ffprobe(path, "-select_streams", "v:0", "-show_entries", "packet=pts_time,flags")
    pts = sorted(Fraction(p["pts_time"]) for p in frames["packets"])
    return [round(t * 1_000_000) for t in pts]


def keyframe_indices(path: Path) -> list[int]:
    packets = ffprobe(path, "-select_streams", "v:0", "-show_entries", "packet=pts_time,flags")
    ordered = sorted(packets["packets"], key=lambda p: Fraction(p["pts_time"]))
    return [i for i, p in enumerate(ordered) if "K" in p["flags"]]


def decode_gray_frame(path: Path, index: int, width: int, height: int) -> bytes:
    raw = subprocess.run(
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
    return raw


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
    lo = max(0, int((around_s - window_s) * 48000))
    hi = int((around_s + window_s) * 48000)
    for i in range(lo, min(hi, len(samples))):
        if abs(samples[i]) > 3000:
            return i / 48000
    raise AssertionError(f"no onset found near {around_s}s")


# --- manifest -----------------------------------------------------------------------------


def test_manifest_lists_every_spec_with_matching_hashes(manifest: dict[str, Any]) -> None:
    files = {f["file"]: f for f in manifest["files"]}
    all_specs: list[VideoSpec | AudioSpec | ImageSpec] = [*VIDEOS, *AUDIOS, *IMAGES]
    expected = {spec_id(s) for s in all_specs}
    assert set(files) == expected
    for name, entry in files.items():
        assert sha256(SAMPLES / name) == entry["sha256"], f"{name} changed since generation"


# --- video --------------------------------------------------------------------------------


@pytest.mark.parametrize("spec", VIDEOS, ids=spec_id)
def test_video_stream_properties(spec: VideoSpec) -> None:
    v = stream(SAMPLES / spec.name, "video")
    assert v["codec_name"] == spec.codec
    assert (v["width"], v["height"]) == (spec.width, spec.height)
    assert v["pix_fmt"] == "yuv420p"
    assert int(v["nb_read_packets"]) == spec.frames
    if spec.vfr_drop_every is None:
        assert Fraction(v["r_frame_rate"]) == spec.fps
        assert Fraction(v["avg_frame_rate"]) == spec.fps


@pytest.mark.parametrize("spec", [v for v in VIDEOS if v.beeps], ids=spec_id)
def test_video_has_48k_stereo_aac(spec: VideoSpec) -> None:
    a = stream(SAMPLES / spec.name, "audio")
    assert (a["codec_name"], int(a["sample_rate"]), a["channels"]) == ("aac", 48000, 2)


@pytest.mark.parametrize("spec", CFR_VIDEOS, ids=spec_id)
def test_frame_times_follow_the_rational_rate(spec: VideoSpec) -> None:
    times = video_frame_times_us(SAMPLES / spec.name)
    assert len(times) == spec.frames
    t0 = times[0]
    for n, t in enumerate(times):
        # Container time bases round pts; allow 100 us (well under any frame period).
        assert abs((t - t0) - frame_start_us(n, spec.fps)) <= 100, (spec.name, n, t)


@pytest.mark.parametrize("spec", CFR_VIDEOS, ids=spec_id)
def test_keyframes_every_gop(spec: VideoSpec) -> None:
    assert keyframe_indices(SAMPLES / spec.name) == list(range(0, spec.frames, spec.gop))


def test_vfr_sample_really_is_variable() -> None:
    spec = next(v for v in VIDEOS if v.vfr_drop_every is not None)
    times = video_frame_times_us(SAMPLES / spec.name)
    assert len(times) == spec.frames
    assert len({b - a for a, b in itertools.pairwise(times)}) > 1


@pytest.mark.parametrize("spec", VIDEOS, ids=spec_id)
def test_barcode_matches_frame_number(spec: VideoSpec) -> None:
    if spec.vfr_drop_every is None:
        source_numbers = list(range(spec.frames))
    else:
        k = spec.vfr_drop_every
        source_numbers = [n for n in range(spec.source_frames) if n % k != k // 2]
    for index in sorted({0, 1, spec.frames // 2, spec.frames - 1}):
        gray = decode_gray_frame(SAMPLES / spec.name, index, spec.width, spec.height)
        decoded = barcode.decode_frame(gray, spec.width, spec.height)
        assert decoded == source_numbers[index], (spec.name, index)


@pytest.mark.parametrize("spec", [v for v in VIDEOS if v.beeps], ids=spec_id)
def test_beeps_start_on_each_second_within_half_a_frame(spec: VideoSpec) -> None:
    pcm = decode_mono_pcm(SAMPLES / spec.name)
    half_frame_s = float(1 / spec.fps) / 2
    for second in range(1, spec.duration_s):
        assert abs(onset_s(pcm, second) - second) <= half_frame_s, (spec.name, second)


# --- audio --------------------------------------------------------------------------------


@pytest.mark.parametrize("spec", AUDIOS, ids=spec_id)
def test_audio_properties(spec: AudioSpec) -> None:
    a = stream(SAMPLES / spec.name, "audio")
    assert a["codec_name"] == spec.codec
    assert (int(a["sample_rate"]), a["channels"]) == (spec.sample_rate, spec.channels)
    assert abs(float(a["duration"]) - spec.duration_s) < 0.05


@pytest.mark.parametrize("spec", [a for a in AUDIOS if a.beeps_at_s], ids=spec_id)
def test_audio_clicks_are_exact(spec: AudioSpec) -> None:
    pcm = decode_mono_pcm(SAMPLES / spec.name)
    for at in spec.beeps_at_s[1:]:
        assert abs(onset_s(pcm, at, window_s=0.02) - at) <= 0.001, (spec.name, at)


def test_silence_gaps_are_silent_and_tone_is_not() -> None:
    spec = next(a for a in AUDIOS if a.silences_s)
    pcm = decode_mono_pcm(SAMPLES / spec.name)

    def peak(start_s: float, end_s: float) -> int:
        return max(abs(x) for x in pcm[int(start_s * 48000) : int(end_s * 48000)])

    for start, end in spec.silences_s:
        assert peak(start + 0.01, end - 0.01) == 0
        assert peak(start - 1.0, start - 0.01) > 3000


# --- images -------------------------------------------------------------------------------


@pytest.mark.parametrize("spec", IMAGES, ids=spec_id)
def test_image_properties(spec: ImageSpec) -> None:
    v = stream(SAMPLES / spec.name, "video")
    assert v["codec_name"] == spec.codec
    assert (v["width"], v["height"]) == (spec.width, spec.height)
    if spec.alpha:
        assert v["pix_fmt"] == "rgba"


# --- reproducibility ----------------------------------------------------------------------


def test_regeneration_is_byte_identical(manifest: dict[str, Any], tmp_path: Path) -> None:
    hashes = {f["file"]: f["sha256"] for f in manifest["files"]}
    video = next(v for v in VIDEOS if v.name == "fn_720p24.mp4")
    audio = next(a for a in AUDIOS if a.codec == "mp3")
    image = next(i for i in IMAGES if i.codec == "webp")
    for cmd, name in (
        (video_command(video, tmp_path / video.name), video.name),
        (audio_command(audio, tmp_path / audio.name), audio.name),
        (image_command(image, tmp_path / image.name), image.name),
    ):
        subprocess.run(cmd, check=True)
        assert sha256(tmp_path / name) == hashes[name], f"{name} is not reproducible"
