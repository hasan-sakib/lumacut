/** One piece of a large picture: what to draw, and which part of it to keep. */
export interface Tile {
  /** The window to render, in canvas pixels (the tile plus a margin, inside the canvas). */
  window: { x: number; y: number; width: number; height: number };
  /** Where the kept part lands in the output, in output pixels. */
  out: { x: number; y: number; width: number; height: number };
  /** Where the kept part is inside the rendered window, in output pixels. */
  inside: { x: number; y: number };
}

/**
 * Splits a picture of `width × height` canvas pixels, drawn at `scale` output pixels per canvas
 * pixel, into tiles whose rendering never exceeds `side` pixels (the GPU's limit, or a memory
 * budget). Each tile is drawn with a margin of `margin` canvas pixels so effects that look at
 * neighbouring pixels (blur, glow on an adjustment layer) have no seam; the margin is discarded.
 * The tiles cover the output exactly once.
 */
export function planTiles(
  width: number,
  height: number,
  scale: number,
  side: number,
  margin: number,
): Tile[] {
  const outW = Math.max(1, Math.round(width * scale));
  const outH = Math.max(1, Math.round(height * scale));
  const marginOut = Math.ceil(margin * scale);
  const step = Math.max(1, side - 2 * marginOut);
  const tiles: Tile[] = [];
  for (let y = 0; y < outH; y += step) {
    for (let x = 0; x < outW; x += step) {
      const w = Math.min(step, outW - x);
      const h = Math.min(step, outH - y);
      // The window in output pixels, widened by the margin but kept inside the picture.
      const wx0 = Math.max(0, x - marginOut);
      const wy0 = Math.max(0, y - marginOut);
      const wx1 = Math.min(outW, x + w + marginOut);
      const wy1 = Math.min(outH, y + h + marginOut);
      tiles.push({
        window: {
          x: wx0 / scale,
          y: wy0 / scale,
          width: (wx1 - wx0) / scale,
          height: (wy1 - wy0) / scale,
        },
        out: { x, y, width: w, height: h },
        inside: { x: x - wx0, y: y - wy0 },
      });
    }
  }
  return tiles;
}

/**
 * Converts premultiplied RGBA8 (what the engine reads back) to straight alpha (what `ImageData`
 * and image encoders expect), in place.
 */
export function unpremultiply(pixels: Uint8Array | Uint8ClampedArray): void {
  for (let i = 0; i < pixels.length; i += 4) {
    const a = pixels[i + 3] ?? 255;
    if (a === 255 || a === 0) continue;
    const k = 255 / a;
    pixels[i] = Math.min(255, Math.round((pixels[i] ?? 0) * k));
    pixels[i + 1] = Math.min(255, Math.round((pixels[i + 1] ?? 0) * k));
    pixels[i + 2] = Math.min(255, Math.round((pixels[i + 2] ?? 0) * k));
  }
}
