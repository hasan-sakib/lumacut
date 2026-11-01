"""Host-side tests for the sample generator (no ffmpeg needed)."""

import random
from fractions import Fraction
from pathlib import Path

import pytest

from lumacut_worker.samples import barcode
from lumacut_worker.samples.generate import audio_command, commands, image_command, video_command
from lumacut_worker.samples.specs import AUDIOS, IMAGES, VIDEOS, VideoSpec, frame_start_us


@pytest.mark.parametrize("width", [1280, 1920, 1080])
def test_barcode_round_trips_every_bit_pattern(width: int) -> None:
    frames = [0, 1, 2, 255, 256, 1234, 2**16 - 1, *random.Random(7).sample(range(2**16), 50)]
    for frame in frames:
        assert barcode.decode_row(barcode.encode_row(frame, width)) == frame


def test_barcode_rejects_frames_outside_16_bits() -> None:
    with pytest.raises(ValueError):
        barcode.encode_row(2**16, 1920)


def test_barcode_requires_markers() -> None:
    with pytest.raises(barcode.BarcodeError):
        barcode.decode_row(bytes(1920))  # all black: no start marker


def test_decode_frame_reads_the_bottom_strip() -> None:
    width, height = 64 * barcode.CELLS, 120
    rows = [bytes(width)] * (height - barcode.strip_height(height))
    rows += [barcode.encode_row(4321, width)] * barcode.strip_height(height)
    assert barcode.decode_frame(b"".join(rows), width, height) == 4321
    with pytest.raises(barcode.BarcodeError):
        barcode.decode_frame(b"\x00" * 10, width, height)


def test_geq_expression_mentions_all_cells() -> None:
    expr = barcode.geq_luma_expression()
    assert f"X*{barcode.CELLS}/W" in expr and "pow(2,16-" in expr


def test_strip_height_is_even() -> None:
    for h in (720, 1080, 1920, 101):
        assert barcode.strip_height(h) % 2 == 0


def test_frame_start_matches_schema_rounding_rule() -> None:
    # Same values as packages/schema/test/time.test.ts.
    assert frame_start_us(1, Fraction(30)) == 33_333
    assert frame_start_us(2, Fraction(30)) == 66_667
    assert frame_start_us(1, Fraction(30000, 1001)) == 33_367
    assert frame_start_us(30_000, Fraction(30000, 1001)) == 1_001_000_000


def test_frame_count_includes_a_partial_last_frame() -> None:
    # 10 s at 30000/1001 fps: frame 299 starts at 9.977 s, so there are 300 frames.
    assert VideoSpec("x.mp4", 16, 16, Fraction(30000, 1001), 10).frames == 300
    assert VideoSpec("x.mp4", 16, 16, Fraction(30), 10).frames == 300


def test_vfr_spec_drops_one_frame_in_seven() -> None:
    spec = VideoSpec("x.mp4", 16, 16, Fraction(30), 7, vfr_drop_every=7)
    assert spec.source_frames == 210
    assert spec.frames == 180


def test_video_command_sets_gop_codec_and_rate(tmp_path: Path) -> None:
    spec = next(v for v in VIDEOS if v.name == "fn_1080p2997.mp4")
    cmd = video_command(spec, tmp_path / spec.name)
    joined = " ".join(cmd)
    assert "rate=30000/1001" in joined
    assert "keyint=30:min-keyint=30:scenecut=0" in joined
    assert "threads=1" in joined and "+bitexact" in cmd
    assert cmd[-1] == str(tmp_path / spec.name)


def test_hevc_and_vfr_commands(tmp_path: Path) -> None:
    hevc = next(v for v in VIDEOS if v.codec == "hevc")
    assert "libx265" in video_command(hevc, tmp_path / "h.mp4")
    vfr = next(v for v in VIDEOS if v.vfr_drop_every is not None)
    cmd = video_command(vfr, tmp_path / "v.mp4")
    assert cmd[cmd.index("-fps_mode") + 1] == "vfr"


def test_audio_and_image_commands(tmp_path: Path) -> None:
    mp3 = next(a for a in AUDIOS if a.codec == "mp3")
    assert "libmp3lame" in audio_command(mp3, tmp_path / mp3.name)
    alpha = next(i for i in IMAGES if i.alpha)
    assert "rgba" in image_command(alpha, tmp_path / alpha.name)


def test_every_spec_has_a_unique_name_and_purpose(tmp_path: Path) -> None:
    jobs = commands(tmp_path)
    names = [spec.name for spec, _ in jobs]
    assert len(names) == len(set(names)) == len(VIDEOS) + len(AUDIOS) + len(IMAGES)
    assert all(spec.purpose for spec, _ in jobs)
