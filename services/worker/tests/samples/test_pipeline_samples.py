"""The processing pipeline on every sample (run inside the worker image: `make test-samples`)."""

import json
import math
import os
import shutil
from collections.abc import Callable
from dataclasses import dataclass
from fractions import Fraction
from pathlib import Path
from typing import Any

import pytest
from PIL import Image

from lumacut_worker.pipeline import thumbs, video
from lumacut_worker.pipeline.errors import ProcessingError
from lumacut_worker.pipeline.probe import snap_fps
from lumacut_worker.pipeline.process import PipelineResult, process_file
from lumacut_worker.samples import barcode
from lumacut_worker.samples.media_check import (
    decode_gray_frame,
    decode_mono_pcm,
    keyframe_indices,
    onset_s,
    stream,
    top_level_atoms,
)
from lumacut_worker.samples.specs import AUDIOS, IMAGES, VIDEOS, AudioSpec, ImageSpec, VideoSpec

pytestmark = pytest.mark.samples

SAMPLES = Path(os.environ.get("LUMACUT_SAMPLES_DIR", "/samples"))
CFR_VIDEOS = [v for v in VIDEOS if v.vfr_drop_every is None]


@dataclass
class Run:
    result: PipelineResult
    progress: list[tuple[str, float]]


@pytest.fixture(scope="session")
def processed(tmp_path_factory: pytest.TempPathFactory) -> Callable[[str], Run]:
    cache: dict[str, Run] = {}

    def run(name: str) -> Run:
        if name not in cache:
            src = SAMPLES / name
            assert src.exists(), f"{src} missing: run `make samples` first"
            progress: list[tuple[str, float]] = []
            work = tmp_path_factory.mktemp(name.replace(".", "_"))
            result = process_file(src, work, lambda s, p: progress.append((s, p)))
            cache[name] = Run(result, progress)
        return cache[name]

    return run


def spec_id(spec: VideoSpec | AudioSpec | ImageSpec) -> str:
    return spec.name


def by_sample[S: (VideoSpec, AudioSpec, ImageSpec)](specs: list[S] | tuple[S, ...]) -> list[Any]:
    """Parametrize per sample, grouped so pytest-xdist processes each sample on one worker."""
    return [
        pytest.param(spec, id=spec.name, marks=pytest.mark.xdist_group(spec.name)) for spec in specs
    ]


def target_fps(spec: VideoSpec) -> Fraction:
    return snap_fps(spec.fps)


# --- video: proxy ---------------------------------------------------------------------------


@pytest.mark.parametrize("spec", by_sample(VIDEOS))
def test_proxy_is_720p_h264_cfr_short_gop_aac48k_faststart(
    spec: VideoSpec, processed: Callable[[str], Run]
) -> None:
    proxy = processed(spec.name).result.files["proxy"]
    v = stream(proxy, "video")
    assert v["codec_name"] == "h264" and v["pix_fmt"] == "yuv420p"
    assert (v["width"], v["height"]) == video.fit_box(spec.width, spec.height, (1280, 720))
    assert max(v["width"], v["height"]) <= 1280 and min(v["width"], v["height"]) <= 720
    fps = target_fps(spec)
    assert Fraction(v["r_frame_rate"]) == fps
    assert Fraction(v["avg_frame_rate"]) == fps  # constant frame rate, also for the VFR source
    gop = math.ceil(fps / 2)
    frames = int(v["nb_read_packets"])
    assert keyframe_indices(proxy) == list(range(0, frames, gop))
    a = stream(proxy, "audio")
    assert (a["codec_name"], int(a["sample_rate"]), a["channels"]) == ("aac", 48000, 2)
    atoms = top_level_atoms(proxy)
    assert atoms.index("moov") < atoms.index("mdat")


@pytest.mark.parametrize("spec", by_sample(CFR_VIDEOS))
def test_proxy_frame_n_still_shows_frame_n(
    spec: VideoSpec, processed: Callable[[str], Run]
) -> None:
    proxy = processed(spec.name).result.files["proxy"]
    v = stream(proxy, "video")
    assert int(v["nb_read_packets"]) == spec.frames
    for index in sorted({0, 1, spec.frames // 2, spec.frames - 1}):
        gray = decode_gray_frame(proxy, index)
        assert barcode.decode_frame(gray, v["width"], v["height"]) == index, (spec.name, index)


@pytest.mark.parametrize("spec", by_sample(VIDEOS))
def test_proxy_audio_stays_in_sync(spec: VideoSpec, processed: Callable[[str], Run]) -> None:
    pcm = decode_mono_pcm(processed(spec.name).result.files["proxy"])
    half_frame_s = float(1 / target_fps(spec)) / 2
    for second in range(1, spec.duration_s):
        assert abs(onset_s(pcm, second) - second) <= half_frame_s, (spec.name, second)


# --- video: master, thumbnails, waveform, metadata -------------------------------------------


@pytest.mark.parametrize("spec", by_sample(VIDEOS))
def test_master_is_1080p_h264_with_1s_gop(spec: VideoSpec, processed: Callable[[str], Run]) -> None:
    master = processed(spec.name).result.files["master"]
    v = stream(master, "video")
    assert v["codec_name"] == "h264"
    assert (v["width"], v["height"]) == video.fit_box(spec.width, spec.height, (1920, 1080))
    fps = target_fps(spec)
    assert Fraction(v["avg_frame_rate"]) == fps
    assert keyframe_indices(master)[:3] == [0, math.ceil(fps), 2 * math.ceil(fps)]
    assert int(stream(master, "audio")["sample_rate"]) == 48000
    atoms = top_level_atoms(master)
    assert atoms.index("moov") < atoms.index("mdat")


@pytest.mark.parametrize("spec", by_sample(VIDEOS))
def test_poster_and_sprite_sheets_match_their_index(
    spec: VideoSpec, processed: Callable[[str], Run]
) -> None:
    run = processed(spec.name).result
    with Image.open(run.files["poster"]) as poster:
        assert poster.width == 480
    index = run.thumb_index
    assert index is not None
    duration_us = spec.duration_s * 1_000_000
    assert index["intervalUs"] == 1_000_000 and index["tileHeight"] == 90
    assert index["count"] == thumbs.tile_count(duration_us, index["intervalUs"])
    assert len(index["sheets"]) == math.ceil(index["count"] / 100)
    with Image.open(run.files[f"thumbs/{index['sheets'][0]}"]) as sheet:
        rows = math.ceil(min(index["count"], 100) / 10)
        assert sheet.size == (10 * index["tileWidth"], rows * 90)


@pytest.mark.parametrize("spec", by_sample(VIDEOS))
def test_waveform_peaks_mark_each_beep(spec: VideoSpec, processed: Callable[[str], Run]) -> None:
    peaks = json.loads(processed(spec.name).result.files["waveform"].read_text())
    assert (peaks["version"], peaks["channels"], peaks["bits"]) == (2, 2, 8)
    assert (peaks["sample_rate"], peaks["samples_per_pixel"]) == (48000, 480)
    assert abs(peaks["length"] - spec.duration_s * 100) <= 2
    data = peaks["data"]
    per_pixel = 4  # 2 channels x (min, max)
    for second in range(1, spec.duration_s):
        loud = max(
            data[(second * 100 + 1) * per_pixel + 1], data[(second * 100 + 2) * per_pixel + 1]
        )
        quiet = max(abs(x) for x in data[(second * 100 + 50) * per_pixel :][:per_pixel])
        assert loud > 40 and quiet <= 1, (spec.name, second, loud, quiet)


@pytest.mark.parametrize("spec", by_sample(VIDEOS))
def test_media_metadata_and_progress(spec: VideoSpec, processed: Callable[[str], Run]) -> None:
    run = processed(spec.name)
    media: dict[str, Any] = run.result.media
    assert run.result.kind == "video"
    assert (media["video"]["width"], media["video"]["height"]) == (spec.width, spec.height)
    fps = target_fps(spec)
    assert media["video"]["fps"] == {"num": fps.numerator, "den": fps.denominator}
    assert abs(media["video"]["durationUs"] - spec.duration_s * 1_000_000) < 100_000
    assert media["audio"]["sampleRate"] == 48000
    values = [p for _, p in run.progress]
    assert values == sorted(values) and values[-1] == pytest.approx(1.0)
    stages = list(dict.fromkeys(s for s, _ in run.progress))
    assert stages == ["probe", "proxy", "master", "thumbnails", "waveform"]


# --- audio --------------------------------------------------------------------------------


@pytest.mark.parametrize("spec", by_sample(AUDIOS))
def test_audio_assets(spec: AudioSpec, processed: Callable[[str], Run]) -> None:
    run = processed(spec.name).result
    assert run.kind == "audio" and "poster" not in run.files
    proxy, master = run.files["proxy"], run.files["master"]
    assert proxy.suffix == ".m4a" and master.suffix == ".flac"
    a = stream(proxy, "audio")
    assert (a["codec_name"], int(a["sample_rate"]), a["channels"]) == ("aac", 48000, 2)
    assert stream(master, "audio")["codec_name"] == "flac"
    peaks = json.loads(run.files["waveform"].read_text())
    assert abs(peaks["length"] - spec.duration_s * 100) <= 2
    assert run.media["audio"]["durationUs"] == pytest.approx(
        spec.duration_s * 1_000_000, abs=60_000
    )


@pytest.mark.xdist_group("audio_silence_gaps.wav")
def test_silence_gaps_are_silent_in_the_waveform(processed: Callable[[str], Run]) -> None:
    spec = next(a for a in AUDIOS if a.silences_s)
    peaks = json.loads(processed(spec.name).result.files["waveform"].read_text())
    data = peaks["data"]
    for start, end in spec.silences_s:
        gap = data[int(start * 100 + 5) * 4 : int(end * 100 - 5) * 4]
        assert gap and max(abs(x) for x in gap) == 0, (start, end)
        tone = data[int(start * 100 - 50) * 4 : int(start * 100 - 10) * 4]
        assert max(tone) > 40


@pytest.mark.xdist_group("audio_120bpm_clicks.wav")
def test_audio_clicks_stay_on_the_beat(processed: Callable[[str], Run]) -> None:
    spec = next(a for a in AUDIOS if a.name == "audio_120bpm_clicks.wav")
    pcm = decode_mono_pcm(processed(spec.name).result.files["proxy"])
    for at in spec.beeps_at_s[1:20]:
        assert abs(onset_s(pcm, at, window_s=0.05) - at) <= 0.005, at


# --- images -------------------------------------------------------------------------------


@pytest.mark.parametrize("spec", by_sample(IMAGES))
def test_images(spec: ImageSpec, processed: Callable[[str], Run]) -> None:
    run = processed(spec.name).result
    assert run.kind == "image"
    assert run.media == {"image": {"width": spec.width, "height": spec.height}}
    normalized = run.files["normalized"]
    assert normalized.suffix == (".png" if spec.alpha else ".jpg")
    with Image.open(normalized) as img:
        assert img.size == (spec.width, spec.height)
        assert img.mode == ("RGBA" if spec.alpha else "RGB")
    with Image.open(run.files["preview"]) as preview, Image.open(run.files["thumb"]) as thumb:
        assert max(preview.size) == min(2048, max(spec.width, spec.height))
        assert max(thumb.size) == 480
        if spec.alpha:
            assert preview.mode == "RGBA"


# --- failures -----------------------------------------------------------------------------


def test_truncated_video_is_reported_as_damaged(tmp_path: Path) -> None:
    src = SAMPLES / "fn_1080p30.mp4"
    cut = tmp_path / "cut.mp4"
    data = src.read_bytes()
    cut.write_bytes(data[: int(len(data) * 0.4)])
    with pytest.raises(ProcessingError) as err:
        process_file(cut, tmp_path / "work", lambda s, p: None)
    assert err.value.code == "corrupt_file"
    assert "damaged or incomplete" in err.value.message


def test_non_media_file_is_unsupported(tmp_path: Path) -> None:
    fake = tmp_path / "notes.mp4"
    fake.write_text("this is a text file pretending to be a video\n" * 100)
    with pytest.raises(ProcessingError) as err:
        process_file(fake, tmp_path / "work", lambda s, p: None)
    assert err.value.code == "unsupported_format"


def test_video_without_audio_has_no_waveform(tmp_path: Path) -> None:
    src = tmp_path / "silent.mp4"
    shutil.copy(SAMPLES / "fn_720p24.mp4", tmp_path / "with_audio.mp4")
    from lumacut_worker.pipeline.ffmpeg import run_ffmpeg

    run_ffmpeg(["-i", str(tmp_path / "with_audio.mp4"), "-an", "-c:v", "copy", str(src)])
    result = process_file(src, tmp_path / "work", lambda s, p: None)
    assert "waveform" not in result.files and "audio" not in result.media
    with pytest.raises(AssertionError):
        stream(result.files["proxy"], "audio")
