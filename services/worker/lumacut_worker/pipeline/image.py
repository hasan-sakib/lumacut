"""Image normalization with Pillow: orientation, sRGB, size limit, preview and thumbnail."""

import io
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageCms, ImageOps, UnidentifiedImageError

from lumacut_worker.pipeline.errors import ProcessingError

MAX_LONG_SIDE = 8192  # SPEC §2 limit for the editor
PREVIEW_LONG_SIDE = 2048
THUMB_LONG_SIDE = 480
# Refuse decompression bombs, but well above anything a camera produces.
Image.MAX_IMAGE_PIXELS = 400_000_000

_SRGB = ImageCms.createProfile("sRGB")


@dataclass(frozen=True)
class ImageResult:
    width: int
    height: int
    has_alpha: bool
    downscaled_from: tuple[int, int] | None
    normalized: Path
    preview: Path
    thumb: Path


def is_image(path: Path) -> bool:
    """True if Pillow recognizes the file (checked before ffprobe)."""
    try:
        with Image.open(path) as img:
            img.verify()
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError):
        return False
    except Image.DecompressionBombError:
        return True  # it is an image; process_image reports it clearly
    return True


def _has_alpha(img: Image.Image) -> bool:
    return img.mode in ("RGBA", "LA", "PA") or (img.mode == "P" and "transparency" in img.info)


def _to_8bit(img: Image.Image) -> Image.Image:
    """16-bit/32-bit integer greyscale must be scaled, not clipped, into 8 bits."""
    if img.mode.startswith("I;16"):
        peak = 65535.0
    elif img.mode == "I":
        extrema = img.getextrema()
        high = extrema[1] if isinstance(extrema, tuple) else extrema
        peak = float(high) if isinstance(high, int | float) and high > 0 else 1.0
    else:
        return img
    return img.point(lambda v: v * (255 / peak)).convert("L")


def _to_srgb(img: Image.Image) -> Image.Image:
    """Convert to 8-bit RGB/RGBA in sRGB, honoring an embedded ICC profile."""
    img = _to_8bit(img)
    alpha = _has_alpha(img)
    target = "RGBA" if alpha else "RGB"
    icc = img.info.get("icc_profile")
    if icc and img.mode in ("RGB", "RGBA", "CMYK", "L"):
        try:
            source = ImageCms.ImageCmsProfile(io.BytesIO(icc))
            converted = ImageCms.profileToProfile(
                img, source, _SRGB, outputMode="RGBA" if img.mode == "RGBA" else "RGB"
            )
            if converted is not None:
                return converted.convert(target)
        except ImageCms.PyCMSError:
            pass  # broken profile: fall back to a plain conversion
    return img.convert(target)


def _fit(img: Image.Image, long_side: int) -> Image.Image:
    if max(img.size) <= long_side:
        return img
    copy = img.copy()
    copy.thumbnail((long_side, long_side), Image.Resampling.LANCZOS)
    return copy


def process_image(src: Path, out_dir: Path) -> ImageResult:
    out_dir.mkdir(parents=True, exist_ok=True)
    try:
        with Image.open(src) as opened:
            opened.seek(0)  # animated GIF/WebP/APNG: first frame
            img = ImageOps.exif_transpose(opened)
            img.load()
    except Image.DecompressionBombError as exc:
        raise ProcessingError("image_too_large", str(exc)) from exc
    except (UnidentifiedImageError, SyntaxError) as exc:
        raise ProcessingError("unsupported_format", str(exc)) from exc
    except OSError as exc:
        raise ProcessingError("corrupt_file", str(exc)) from exc

    srgb = _to_srgb(img)
    alpha = srgb.mode == "RGBA"
    original_size = srgb.size
    normalized_img = _fit(srgb, MAX_LONG_SIDE)
    downscaled = original_size if normalized_img.size != original_size else None

    if alpha:
        normalized = out_dir / "normalized.png"
        normalized_img.save(normalized, compress_level=6)
    else:
        normalized = out_dir / "normalized.jpg"
        normalized_img.save(normalized, quality=95, subsampling=0)
    preview = out_dir / "preview.webp"
    _fit(normalized_img, PREVIEW_LONG_SIDE).save(preview, quality=85)
    thumb = out_dir / "thumb.webp"
    _fit(normalized_img, THUMB_LONG_SIDE).save(thumb, quality=80)
    return ImageResult(
        width=normalized_img.width,
        height=normalized_img.height,
        has_alpha=alpha,
        downscaled_from=downscaled,
        normalized=normalized,
        preview=preview,
        thumb=thumb,
    )
