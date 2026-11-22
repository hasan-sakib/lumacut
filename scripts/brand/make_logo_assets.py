"""Builds every logo file the web app uses from the master artwork.

Usage: .venv/bin/python scripts/brand/make_logo_assets.py [master.png]
(default master: docs/brand/lumacut-logo.png, the wordmark on pure black).

Writes to apps/web/public/brand/ and apps/web/public/:
  lumacut-wordmark-dark.png   wordmark for dark backgrounds (original colours, transparent)
  lumacut-wordmark-light.png  wordmark for light backgrounds (white letters turned to ink)
  lumacut-mark.png            the film-strip "L" alone, transparent (square)
  favicon.ico, favicon-32.png, apple-touch-icon.png, icon-192.png, icon-512.png
                              the "L" on a dark rounded tile
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
MASTER = ROOT / "docs/brand/lumacut-logo.png"
BRAND = ROOT / "apps/web/public/brand"
PUBLIC = ROOT / "apps/web/public"

INK = np.array([22, 26, 34]) / 255  # the light theme's text colour (--color-neutral-100)
TILE = (13, 11, 20, 255)  # favicon tile: near-black with a hint of violet
WORDMARK_WIDTH = 800  # enough for a 40 px tall logo on a 4x screen
SOLID = 0.45  # a pixel this bright (brightest channel) is inside a letter
REACH = 10  # how far (px) a letter's colour is spread out to its anti-aliased edge and glow
FLOOR = 0.12  # coverage below this is dropped (the soft glow around letters)

SHIFTS = [(dy, dx) for dy in (-1, 0, 1) for dx in (-1, 0, 1) if (dy, dx) != (0, 0)]


def spread(colour: np.ndarray, known: np.ndarray, steps: int) -> tuple[np.ndarray, np.ndarray]:
    """Grows the known colours outwards, one pixel per step (average of known neighbours)."""
    colour, known = colour.copy(), known.copy()
    for _ in range(steps):
        total = np.zeros_like(colour)
        count = np.zeros(known.shape)
        for dy, dx in SHIFTS:
            k = np.roll(known, (dy, dx), axis=(0, 1))
            total += np.roll(colour, (dy, dx), axis=(0, 1)) * k[..., None]
            count += k
        grow = ~known & (count > 0)
        colour[grow] = total[grow] / count[grow][:, None]
        known |= grow
    return colour, known


def keyed(rgb: np.ndarray) -> np.ndarray:
    """Black background → transparency. Inside the letters the colour is kept as drawn; at the
    edges the true colour is taken from the nearest letter pixel and the coverage follows from
    how bright the pixel is compared with it, so edges and glows don't turn grey on light
    backgrounds."""
    m = rgb.max(axis=2)
    solid = m >= SOLID
    colour, reached = spread(np.where(solid[..., None], rgb, 0), solid, REACH)
    coverage = np.where(solid, 1, m / np.maximum(colour.max(axis=2), 1e-6))
    alpha = np.where(reached, np.clip((coverage - FLOOR) / (1 - FLOOR), 0, 1), 0)
    colour[alpha == 0] = 0
    return np.dstack([colour, alpha])


def sat(rgb: np.ndarray) -> np.ndarray:
    """HSV saturation, 0 for black."""
    mx, mn = rgb.max(axis=2), rgb.min(axis=2)
    return np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)


def light_variant(rgba: np.ndarray) -> np.ndarray:
    """White and grey parts become ink, so the wordmark reads on a light background."""
    rgb = rgba[..., :3]
    # 1 for neutral pixels, 0 for coloured ones, a short ramp between.
    neutral = np.clip((0.28 - sat(rgb)) / 0.12, 0, 1)[..., None]
    out = rgba.copy()
    out[..., :3] = rgb * (1 - neutral) + INK * neutral
    return out


def to_image(rgba: np.ndarray) -> Image.Image:
    return Image.fromarray((rgba * 255).round().astype(np.uint8), "RGBA")


def bbox(alpha: np.ndarray, x0: int = 0, x1: int | None = None) -> tuple[int, int, int, int]:
    ys, xs = np.where(alpha[:, x0:x1] > 0.2)
    return int(xs.min()) + x0, int(ys.min()), int(xs.max()) + x0 + 1, int(ys.max()) + 1


def square(img: Image.Image, size: int, fill: float) -> Image.Image:
    """`img` centred in a transparent square, its longer side `fill` of the square."""
    scale = size * fill / max(img.size)
    w, h = round(img.width * scale), round(img.height * scale)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.alpha_composite(
        img.resize((w, h), Image.Resampling.LANCZOS), ((size - w) // 2, (size - h) // 2)
    )
    return out


def tile(mark: Image.Image, size: int, *, rounded: bool) -> Image.Image:
    """The mark on the dark tile (rounded for browser tabs, square for iOS, which rounds it)."""
    base = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(base).rounded_rectangle(
        (0, 0, size - 1, size - 1), radius=round(size * 0.22) if rounded else 0, fill=TILE
    )
    base.alpha_composite(square(mark, size, 0.74))
    return base


def main() -> None:
    master = Path(sys.argv[1]) if len(sys.argv) > 1 else MASTER
    rgb = np.asarray(Image.open(master).convert("RGB")).astype(float) / 255
    rgba = keyed(rgb)
    alpha = rgba[..., 3]

    pad = 10
    x0, y0, x1, y1 = bbox(alpha)
    word = rgba[max(0, y0 - pad) : y1 + pad, max(0, x0 - pad) : x1 + pad]
    height = round(word.shape[0] * WORDMARK_WIDTH / word.shape[1])
    BRAND.mkdir(parents=True, exist_ok=True)
    for name, data in (("dark", word), ("light", light_variant(word))):
        to_image(data).resize((WORDMARK_WIDTH, height), Image.Resampling.LANCZOS).save(
            BRAND / f"lumacut-wordmark-{name}.png", optimize=True
        )

    # The "L" is the purple film strip at the far left. It touches the "u", so it is found by
    # colour: the purple pixels' box, with anything neutral (the white "u") cleared inside it.
    c = rgba[..., :3]
    purple = (sat(c) > 0.3) & (c[..., 2] > c[..., 1] * 1.2) & (c[..., 0] > c[..., 1] * 1.1)
    purple &= rgba[..., 3] > 0
    purple[:, (x0 + x1) // 2 :] = False
    ys, xs = np.where(purple & (rgba[..., 3] > 0.5))
    lx0, ly0 = int(xs.min()) - 2, int(ys.min()) - 2
    lx1, ly1 = int(xs.max()) + 3, int(ys.max()) + 3
    piece = rgba[ly0:ly1, lx0:lx1].copy()
    piece[..., 3] *= purple[ly0:ly1, lx0:lx1]
    mark = to_image(piece)
    square(mark, 256, 0.96).save(BRAND / "lumacut-mark.png", optimize=True)

    tile(mark, 32, rounded=True).save(PUBLIC / "favicon-32.png", optimize=True)
    tile(mark, 256, rounded=True).save(PUBLIC / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    tile(mark, 180, rounded=False).save(PUBLIC / "apple-touch-icon.png", optimize=True)
    for size in (192, 512):
        tile(mark, size, rounded=True).save(PUBLIC / f"icon-{size}.png", optimize=True)
    print(f"wordmark {WORDMARK_WIDTH}x{height}, mark x={lx0}..{lx1} y={ly0}..{ly1}")


if __name__ == "__main__":
    main()
