"""Pure pipeline logic, testable on the host without ffmpeg."""

import io
from fractions import Fraction
from pathlib import Path
from typing import Any

import numpy as np
import pytest
from PIL import Image, ImageCms

from lumacut_worker.pipeline import image, probe, thumbs, video
from lumacut_worker.pipeline.errors import ProcessingError
from lumacut_worker.pipeline.ffmpeg import classify_failure, parse_progress_line
from lumacut_worker.pipeline.process import StageTracker
from lumacut_worker.pipeline.waveform import peaks_from_chunks

# --- probe ----------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("rate", "snapped"),
    [
        (Fraction(30), Fraction(30)),
        (Fraction(30000, 1001), Fraction(30000, 1001)),
        (Fraction(2997, 100), Fraction(30000, 1001)),
        (Fraction(29), Fraction(30000, 1001)),
        (Fraction(23976, 1000), Fraction(24000, 1001)),
        (Fraction(120), Fraction(60)),
        (Fraction(10), Fraction(24000, 1001)),
        (None, Fraction(30)),
    ],
)
def test_snap_fps(rate: Fraction | None, snapped: Fraction) -> None:
    assert probe.snap_fps(rate) == snapped


@pytest.mark.parametrize(
    ("base", "average", "chosen"),
    [
        (Fraction(30), Fraction(257, 10), Fraction(30)),  # phone VFR: dropped frames
        (Fraction(30000, 1001), Fraction(2996, 100), Fraction(30000, 1001)),
        (Fraction(90000), Fraction(2997, 100), Fraction(30000, 1001)),  # bogus base rate
        (Fraction(120), Fraction(120), Fraction(60)),  # high-frame-rate capped
        (None, Fraction(25), Fraction(25)),
        (None, None, Fraction(30)),
    ],
)
def test_choose_fps(base: Fraction | None, average: Fraction | None, chosen: Fraction) -> None:
    assert probe.choose_fps(base, average) == chosen


def test_parse_rate() -> None:
    assert probe.parse_rate("30000/1001") == Fraction(30000, 1001)
    assert probe.parse_rate("0/0") is None
    assert probe.parse_rate("") is None


def fake_ffprobe(monkeypatch: pytest.MonkeyPatch, data: dict[str, Any]) -> None:
    monkeypatch.setattr(probe, "ffprobe_json", lambda _path: data)


def test_probe_applies_rotation_and_detects_vfr(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_ffprobe(
        monkeypatch,
        {
            "format": {"duration": "12.5"},
            "streams": [
                {
                    "codec_type": "video",
                    "codec_name": "hevc",
                    "width": 1920,
                    "height": 1080,
                    "avg_frame_rate": "2997/100",
                    "r_frame_rate": "30/1",
                    "side_data_list": [{"rotation": -90}],
                },
                {"codec_type": "audio", "codec_name": "aac", "sample_rate": "44100", "channels": 1},
            ],
        },
    )
    p = probe.probe_media(Path("x"))
    assert p.duration_us == 12_500_000
    assert p.video is not None and (p.video.width, p.video.height) == (1080, 1920)
    assert p.video.rotation == 270 and p.video.variable_frame_rate
    assert p.video.fps == Fraction(30)  # standard base rate wins over the 29.97 average
    assert p.audio == probe.AudioProbe(sample_rate=44100, channels=1, codec="aac")


def test_probe_ignores_cover_art_and_rejects_streamless_files(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_ffprobe(
        monkeypatch,
        {
            "format": {"duration": "3"},
            "streams": [
                {
                    "codec_type": "video",
                    "codec_name": "mjpeg",
                    "width": 600,
                    "height": 600,
                    "disposition": {"attached_pic": 1},
                },
                {"codec_type": "audio", "codec_name": "mp3", "sample_rate": "48000", "channels": 2},
            ],
        },
    )
    assert probe.probe_media(Path("x")).video is None
    fake_ffprobe(monkeypatch, {"format": {}, "streams": [{"codec_type": "data"}]})
    with pytest.raises(ProcessingError) as err:
        probe.probe_media(Path("x"))
    assert err.value.code == "no_media_streams"


# --- ffmpeg helpers ---------------------------------------------------------------------------


def test_parse_progress_line() -> None:
    assert parse_progress_line("out_time_us=5000000\n", 10_000_000) == 0.5
    assert parse_progress_line("out_time_ms=20000000", 10_000_000) == 1.0
    assert parse_progress_line("progress=end", 10_000_000) == 1.0
    assert parse_progress_line("frame=12", 10_000_000) is None
    assert parse_progress_line("out_time_us=N/A", 10_000_000) is None


@pytest.mark.parametrize(
    ("stderr", "code"),
    [
        ("x.mp4: Invalid data found when processing input", "unsupported_format"),
        ("[mov] moov atom not found", "corrupt_file"),
        ("Error while decoding stream #0:0", "corrupt_file"),
        ("Something unexpected", "processing_failed"),
    ],
)
def test_classify_failure(stderr: str, code: str) -> None:
    error = classify_failure(stderr)
    assert error.code == code and error.message


# --- video geometry ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("size", "box", "fitted"),
    [
        ((1920, 1080), (1280, 720), (1280, 720)),
        ((1080, 1920), (1280, 720), (720, 1280)),
        ((640, 360), (1280, 720), (640, 360)),  # never upscale
        ((3840, 1600), (1280, 720), (1280, 534)),
        ((1001, 777), (1280, 720), (928, 720)),
        ((4000, 3000), (1920, 1080), (1440, 1080)),
    ],
)
def test_fit_box(size: tuple[int, int], box: tuple[int, int], fitted: tuple[int, int]) -> None:
    assert video.fit_box(*size, box) == fitted
    assert all(v % 2 == 0 for v in video.fit_box(*size, box))


def test_gop_frames() -> None:
    assert video.gop_frames(Fraction(30), Fraction(1, 2)) == 15
    assert video.gop_frames(Fraction(30000, 1001), Fraction(1, 2)) == 15
    assert video.gop_frames(Fraction(24), Fraction(1, 2)) == 12
    assert video.gop_frames(Fraction(25), Fraction(1, 2)) == 13
    assert video.gop_frames(Fraction(60), Fraction(1)) == 60


def test_video_args_cfr_closed_gop_and_audio(tmp_path: Path) -> None:
    p = probe.MediaProbe(
        duration_us=10_000_000,
        video=probe.VideoProbe(
            1920, 1080, Fraction(30000, 1001), Fraction(30000, 1001), False, "h264", 0
        ),
        audio=probe.AudioProbe(44100, 6, "ac3"),
    )
    args = video.video_args(tmp_path / "in", tmp_path / "out.mp4", p, video.PROXY)
    joined = " ".join(args)
    assert "fps=30000/1001:round=near" in joined and "scale=1280:720" in joined
    assert args[args.index("-g") + 1] == "15" and args[args.index("-sc_threshold") + 1] == "0"
    assert args[args.index("-ar") + 1] == "48000" and args[args.index("-ac") + 1] == "2"
    assert "+faststart" in args
    silent = probe.MediaProbe(p.duration_us, p.video, None)
    assert "-c:a" not in video.video_args(tmp_path / "in", tmp_path / "o.mp4", silent, video.PROXY)


# --- thumbnails -------------------------------------------------------------------------------


def test_sprite_layout_caps_tiles_and_keeps_aspect() -> None:
    short = thumbs.sprite_layout(10_000_000, 1280, 720)
    assert (short.interval_us, short.tile_width, short.tile_height) == (1_000_000, 160, 90)
    assert thumbs.tile_count(10_000_000, short.interval_us) == 10
    long = thumbs.sprite_layout(1_800_000_000, 720, 1280)
    assert long.interval_us == 9_000_000 and long.tile_width == 50
    assert thumbs.tile_count(1_800_000_000, long.interval_us) == 200
    assert thumbs.tile_count(10_500_000, 1_000_000) == 11
    assert thumbs.poster_time_us(10_000_000) == 1_000_000
    assert thumbs.poster_time_us(3_000_000) == 300_000


# --- waveform ---------------------------------------------------------------------------------


def test_peaks_min_max_per_pixel_stereo() -> None:
    left = np.array([0.0, 0.5, -0.25, 1.0], dtype=np.float32)
    right = np.array([-1.0, 0.0, 0.1, 0.2], dtype=np.float32)
    interleaved = np.stack([left, right], axis=1).reshape(-1)
    peaks = peaks_from_chunks([interleaved], channels=2, samples_per_pixel=2)
    # pixel 0: L[0..1] min 0 max .5, R min -1 max 0 ; pixel 1: L min -.25 max 1, R .1/.2
    assert peaks.tolist() == [0, 64, -127, 0, -32, 127, 13, 25]


def test_peaks_do_not_depend_on_chunk_boundaries() -> None:
    rng = np.random.default_rng(1)
    pcm = rng.uniform(-1, 1, size=48_000 * 2 + 37 * 2).astype(np.float32)
    whole = peaks_from_chunks([pcm], channels=2)
    pieces = [pcm[i : i + 999] for i in range(0, len(pcm), 999)]  # odd, unaligned chunks
    assert np.array_equal(peaks_from_chunks(pieces, channels=2), whole)
    assert len(whole) == 4 * 101  # 100 full pixels + 1 partial, 2 channels x (min, max)


def test_peaks_of_silence_are_zero_and_empty_input_is_empty() -> None:
    assert not peaks_from_chunks([np.zeros(960, dtype=np.float32)], channels=1).any()
    assert peaks_from_chunks([], channels=1).size == 0


# --- progress ---------------------------------------------------------------------------------


def test_stage_tracker_maps_stages_onto_overall_progress() -> None:
    seen: list[tuple[str, float]] = []
    tracker = StageTracker((("a", 0.25), ("b", 0.75)), lambda s, p: seen.append((s, p)))
    tracker.fraction("a")(1.0)
    b = tracker.fraction("b")
    b(0.5)
    b(2.0)
    assert seen == [("a", 0.0), ("a", 0.25), ("b", 0.25), ("b", 0.625), ("b", 1.0)]


# --- images (Pillow) --------------------------------------------------------------------------


def save(img: Image.Image, path: Path, **kwargs: Any) -> Path:
    img.save(path, **kwargs)
    return path


def test_jpeg_gets_normalized_preview_and_thumb(tmp_path: Path) -> None:
    src = save(Image.new("RGB", (3000, 2000), (200, 30, 30)), tmp_path / "in.jpg")
    result = image.process_image(src, tmp_path / "out")
    assert (result.width, result.height, result.has_alpha) == (3000, 2000, False)
    assert result.downscaled_from is None and result.normalized.suffix == ".jpg"
    with Image.open(result.preview) as preview, Image.open(result.thumb) as thumb:
        assert preview.size == (2048, 1365) and thumb.size == (480, 320)


def test_exif_orientation_is_applied(tmp_path: Path) -> None:
    exif = Image.Exif()
    exif[0x0112] = 6  # rotate 90 CW on display
    src = save(Image.new("RGB", (400, 100)), tmp_path / "rot.jpg", exif=exif)
    result = image.process_image(src, tmp_path / "out")
    assert (result.width, result.height) == (100, 400)


def test_alpha_is_kept_as_png(tmp_path: Path) -> None:
    src = save(Image.new("RGBA", (64, 32), (0, 0, 255, 128)), tmp_path / "a.png")
    result = image.process_image(src, tmp_path / "out")
    assert result.has_alpha and result.normalized.suffix == ".png"
    with Image.open(result.normalized) as out:
        assert out.mode == "RGBA" and out.getpixel((0, 0)) == (0, 0, 255, 128)
    palette = Image.new("P", (8, 8))
    palette.info["transparency"] = 0
    assert image.process_image(save(palette, tmp_path / "p.gif"), tmp_path / "o2").has_alpha


def test_large_images_are_downscaled_to_8192(tmp_path: Path) -> None:
    src = save(Image.new("RGB", (9000, 100)), tmp_path / "pano.png")
    result = image.process_image(src, tmp_path / "out")
    assert (result.width, result.height) == (8192, 91)
    assert result.downscaled_from == (9000, 100)


def test_cmyk_and_icc_profiles_end_up_srgb(tmp_path: Path) -> None:
    cmyk = save(Image.new("CMYK", (16, 16), (0, 255, 255, 0)), tmp_path / "c.jpg")
    with Image.open(image.process_image(cmyk, tmp_path / "o1").normalized) as out:
        assert out.mode == "RGB"
    srgb = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB"))
    tagged = save(
        Image.new("RGB", (16, 16), (10, 200, 30)), tmp_path / "t.png", icc_profile=srgb.tobytes()
    )
    with Image.open(image.process_image(tagged, tmp_path / "o2").normalized) as out:
        assert out.mode == "RGB" and out.getpixel((0, 0)) == pytest.approx((10, 200, 30), abs=2)
    # A non-sRGB profile (D50 white point) must actually be converted, not just stripped.
    warm = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB"))
    d50 = ImageCms.ImageCmsProfile(ImageCms.createProfile("LAB", 5000))
    lab_img = ImageCms.profileToProfile(
        Image.new("RGB", (16, 16), (128, 128, 128)), warm, d50, outputMode="LAB"
    )
    assert lab_img is not None
    lab_file = save(lab_img, tmp_path / "lab.tif", icc_profile=d50.tobytes())
    with Image.open(image.process_image(lab_file, tmp_path / "o3").normalized) as out:
        assert out.getpixel((0, 0)) == pytest.approx((128, 128, 128), abs=3)


def test_16bit_greyscale_is_scaled_not_clipped(tmp_path: Path) -> None:
    src = save(Image.new("I;16", (8, 8), 32768), tmp_path / "g16.png")
    with Image.open(image.process_image(src, tmp_path / "out").normalized) as out:
        assert out.getpixel((0, 0)) == pytest.approx((128, 128, 128), abs=1)


def test_animated_gif_uses_first_frame(tmp_path: Path) -> None:
    frames = [Image.new("RGB", (20, 10), c) for c in ((255, 0, 0), (0, 255, 0))]
    src = tmp_path / "anim.gif"
    frames[0].save(src, save_all=True, append_images=frames[1:], duration=100)
    with Image.open(image.process_image(src, tmp_path / "out").normalized) as out:
        r, g, _ = out.convert("RGB").getpixel((5, 5))  # type: ignore[misc]
        assert r > 200 and g < 50


def test_image_detection_and_errors(tmp_path: Path) -> None:
    text = tmp_path / "notes.mp4"
    text.write_text("definitely not media")
    assert not image.is_image(text)
    buf = io.BytesIO()
    Image.new("RGB", (100, 100)).save(buf, "PNG")
    truncated = tmp_path / "cut.png"
    truncated.write_bytes(buf.getvalue()[:60])
    with pytest.raises(ProcessingError) as err:
        image.process_image(truncated, tmp_path / "out")
    assert err.value.code in ("corrupt_file", "unsupported_format")
