import type { Mask } from "@lumacut/schema";
import { addOutline, pathOutline } from "./outline.ts";

/** Where the processed layer picture sits, so a mask lines up with it (see `LayerFx.geometry`). */
export interface MaskPlacement {
  x0: number;
  y0: number;
  s: number;
  pad: number;
  width: number;
  height: number;
  /** The layer's own size in layer pixels (a bitmap mask is stretched over it). */
  layerWidth: number;
  layerHeight: number;
}

/** What a bitmap mask is drawn from: its alpha channel is the mask. */
export type MaskBitmaps = ReadonlyMap<string, CanvasImageSource>;

/**
 * Draws a layer's masks into one alpha picture the size of the processed layer. Masks combine
 * in order (add / subtract / intersect). If the first mask isn't "add" the start is the whole
 * layer, so a lone subtract cuts a hole. Each mask has its opacity, expansion (grow or shrink by a
 * stroke), feather (a Gaussian blur) and an invert switch. Returns null when there is nothing to
 * draw (no path masks).
 */
export function renderMasks(
  masks: readonly Mask[],
  place: MaskPlacement,
  bitmaps: MaskBitmaps = new Map(),
): OffscreenCanvas | null {
  // A bitmap mask whose picture isn't there (still loading, failed) is left out.
  const paths = masks.filter((m) => m.kind === "path" || bitmaps.has(m.id));
  const first = paths[0];
  if (first === undefined) return null;
  const { width, height } = place;
  const acc = new OffscreenCanvas(width, height);
  const accCtx = acc.getContext("2d");
  if (accCtx === null) throw new Error("This browser can't draw masks (no 2D canvas)");
  if (first.mode !== "add") {
    accCtx.fillStyle = "#000";
    accCtx.fillRect(0, 0, width, height);
  }
  const setView = (ctx: OffscreenCanvasRenderingContext2D) => {
    ctx.setTransform(
      place.s,
      0,
      0,
      place.s,
      place.pad - place.x0 * place.s,
      place.pad - place.y0 * place.s,
    );
  };

  for (const mask of paths) {
    const shape = new OffscreenCanvas(width, height);
    const ctx = shape.getContext("2d");
    if (ctx === null) continue;
    setView(ctx);
    if (mask.kind === "raster") {
      const bitmap = bitmaps.get(mask.id);
      if (bitmap === undefined) continue;
      ctx.globalAlpha = mask.opacity;
      ctx.drawImage(bitmap, 0, 0, place.layerWidth, place.layerHeight);
      ctx.globalAlpha = 1;
    } else {
      const path = new Path2D();
      addOutline(path, { ...pathOutline(mask.path), closed: true });
      ctx.fillStyle = "#000";
      ctx.globalAlpha = mask.opacity;
      ctx.fill(path);
      if (mask.expansion !== 0) {
        ctx.lineJoin = "round";
        ctx.lineWidth = Math.abs(mask.expansion) * 2;
        if (mask.expansion > 0) {
          ctx.strokeStyle = "#000";
        } else {
          ctx.globalCompositeOperation = "destination-out";
          ctx.globalAlpha = 1;
        }
        ctx.stroke(path);
        ctx.globalCompositeOperation = "source-over";
      }
    }
    let contribution: OffscreenCanvas = shape;
    if (mask.inverted) {
      const inv = new OffscreenCanvas(width, height);
      const ictx = inv.getContext("2d");
      if (ictx !== null) {
        ictx.fillStyle = "#000";
        ictx.fillRect(0, 0, width, height);
        ictx.globalCompositeOperation = "destination-out";
        ictx.drawImage(shape, 0, 0);
        contribution = inv;
      }
    }
    accCtx.setTransform(1, 0, 0, 1, 0, 0);
    accCtx.globalCompositeOperation =
      mask.mode === "add"
        ? "source-over"
        : mask.mode === "subtract"
          ? "destination-out"
          : "destination-in";
    accCtx.filter = mask.feather > 0 ? `blur(${String((mask.feather * place.s) / 2)}px)` : "none";
    accCtx.drawImage(contribution, 0, 0);
    accCtx.filter = "none";
    accCtx.globalCompositeOperation = "source-over";
  }
  return acc;
}
