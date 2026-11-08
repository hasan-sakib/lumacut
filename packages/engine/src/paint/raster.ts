import type { Color, PaintStroke } from "@lumacut/schema";
import { strokeBounds, strokeStamps } from "./stamp.ts";

type Ctx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

/** Where layer pixels land on a raster: layer pixel (x, y) is raster pixel ((x−x0)·scale, (y−y0)·scale). */
export interface PaintPlacement {
  x0: number;
  y0: number;
  scale: number;
}

const css = (c: Color, alpha: number): string =>
  `rgba(${String(Math.round(c.r * 255))},${String(Math.round(c.g * 255))},${String(Math.round(c.b * 255))},${String(alpha)})`;

/**
 * A brush dab as a picture: a disc whose solid core is `hardness` of the radius and whose edge
 * fades to nothing. Drawn once per stroke and scaled for each stamp (pressure changes the size).
 */
function stampSprite(color: Color, hardness: number, size: number): OffscreenCanvas {
  const px = Math.max(2, Math.ceil(size));
  const sprite = new OffscreenCanvas(px, px);
  const ctx = sprite.getContext("2d");
  if (ctx === null) return sprite;
  const r = px / 2;
  if (hardness >= 0.999) {
    ctx.fillStyle = css(color, 1);
    ctx.beginPath();
    ctx.arc(r, r, r - 0.5, 0, Math.PI * 2);
    ctx.fill();
    return sprite;
  }
  const gradient = ctx.createRadialGradient(r, r, 0, r, r, r);
  gradient.addColorStop(0, css(color, 1));
  gradient.addColorStop(Math.max(0, hardness), css(color, 1));
  gradient.addColorStop(1, css(color, 0));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, px, px);
  return sprite;
}

/**
 * Draws one stroke onto `ctx`. The stroke is first built up on its own small layer (stamps add
 * up there, so a slow drag doesn't turn a 50% brush opaque), then laid on the picture at the
 * stroke's opacity: normally, or by erasing for the eraser.
 */
export function drawStroke(ctx: Ctx, stroke: PaintStroke, place: PaintPlacement): void {
  const bounds = strokeBounds(stroke);
  if (bounds === null) return;
  const left = Math.floor((bounds.x0 - place.x0) * place.scale);
  const top = Math.floor((bounds.y0 - place.y0) * place.scale);
  const width = Math.max(1, Math.ceil((bounds.x1 - place.x0) * place.scale) - left);
  const height = Math.max(1, Math.ceil((bounds.y1 - place.y0) * place.scale) - top);
  const layer = new OffscreenCanvas(width, height);
  const lctx = layer.getContext("2d");
  if (lctx === null) return;
  const erasing = stroke.tool === "eraser";
  const sprite = stampSprite(
    erasing ? { r: 0, g: 0, b: 0, a: 1 } : stroke.color,
    stroke.hardness,
    stroke.size * place.scale,
  );
  for (const stamp of strokeStamps(stroke, 0.5 / place.scale)) {
    const d = stamp.radius * 2 * place.scale;
    if (d < 0.25) continue;
    lctx.drawImage(
      sprite,
      (stamp.x - place.x0) * place.scale - left - d / 2,
      (stamp.y - place.y0) * place.scale - top - d / 2,
      d,
      d,
    );
  }
  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.max(0, stroke.opacity)) * (erasing ? 1 : stroke.color.a);
  ctx.globalCompositeOperation = erasing ? "destination-out" : "source-over";
  ctx.drawImage(layer, left, top);
  ctx.restore();
}

/** The layer-pixel box a list of strokes needs, never smaller than the composition. */
export function paintExtent(
  strokes: readonly PaintStroke[],
  compWidth: number,
  compHeight: number,
): { x0: number; y0: number; width: number; height: number } {
  let x0 = 0;
  let y0 = 0;
  let x1 = compWidth;
  let y1 = compHeight;
  for (const stroke of strokes) {
    const b = strokeBounds(stroke);
    if (b === null) continue;
    x0 = Math.min(x0, b.x0);
    y0 = Math.min(y0, b.y0);
    x1 = Math.max(x1, b.x1);
    y1 = Math.max(y1, b.y1);
  }
  // Painting far outside the canvas isn't kept: at most one canvas-size of margin on each side.
  x0 = Math.max(x0, -compWidth);
  y0 = Math.max(y0, -compHeight);
  x1 = Math.min(x1, compWidth * 2);
  y1 = Math.min(y1, compHeight * 2);
  const fx0 = Math.floor(x0);
  const fy0 = Math.floor(y0);
  return {
    x0: fx0,
    y0: fy0,
    width: Math.max(1, Math.ceil(x1) - fx0),
    height: Math.max(1, Math.ceil(y1) - fy0),
  };
}

/**
 * The rasterised strokes of a paint layer. Strokes are drawn onto a canvas that stays alive: when
 * the stroke list only grew (same strokes, new ones at the end) just the new ones are drawn;
 * anything else (undo, a new size or scale) redraws the whole list.
 */
export class PaintRaster {
  readonly canvas: OffscreenCanvas;
  #ids: string[] = [];
  #place: PaintPlacement | null = null;

  constructor(width: number, height: number) {
    this.canvas = new OffscreenCanvas(width, height);
  }

  /** Brings the canvas up to date. Returns true if its pixels changed. */
  update(strokes: readonly PaintStroke[], place: PaintPlacement): boolean {
    const ctx = this.canvas.getContext("2d");
    if (ctx === null) return false;
    const samePlace =
      this.#place !== null &&
      this.#place.x0 === place.x0 &&
      this.#place.y0 === place.y0 &&
      this.#place.scale === place.scale;
    const prefix =
      samePlace &&
      this.#ids.length <= strokes.length &&
      this.#ids.every((id, i) => strokes[i]?.id === id);
    if (prefix && this.#ids.length === strokes.length) return false;
    if (!prefix) {
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.#ids = [];
    }
    for (const stroke of strokes.slice(this.#ids.length)) drawStroke(ctx, stroke, place);
    this.#ids = strokes.map((s) => s.id);
    this.#place = place;
    return true;
  }
}

/** Raster resolution for a paint layer drawn at `drawn` raster pixels per layer pixel: a power of two ≤ 1 that keeps the picture within the pixel budget. */
export function paintResolution(drawn: number, width: number, height: number): number {
  const MAX_PIXELS = 4096 * 4096;
  let bucket = 1;
  while (
    bucket > 1 / 64 &&
    (bucket / 2 >= drawn || width * height * bucket * bucket > MAX_PIXELS)
  ) {
    bucket /= 2;
  }
  return bucket;
}
