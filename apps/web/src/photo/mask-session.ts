import { drawStroke } from "@lumacut/engine/paint";
import type { PaintStroke } from "@lumacut/schema";

/** The longest side of a mask picture (a bigger layer's mask is kept at a smaller scale). */
export const MAX_MASK_SIDE = 4096;

/**
 * A bitmap mask being painted: an alpha picture covering a layer. Fully opaque shows the layer,
 * fully transparent hides it. Strokes are in the layer's own pixels.
 */
export class MaskSession {
  readonly canvas: OffscreenCanvas;
  /** Mask pixels per layer pixel. */
  readonly scale: number;
  readonly layerWidth: number;
  readonly layerHeight: number;

  private constructor(layerWidth: number, layerHeight: number) {
    this.layerWidth = layerWidth;
    this.layerHeight = layerHeight;
    this.scale = Math.min(1, MAX_MASK_SIDE / Math.max(layerWidth, layerHeight));
    this.canvas = new OffscreenCanvas(
      Math.max(1, Math.round(layerWidth * this.scale)),
      Math.max(1, Math.round(layerHeight * this.scale)),
    );
  }

  /** A mask over a layer of this size: the existing picture (its alpha), or everything shown. */
  static create(
    layerWidth: number,
    layerHeight: number,
    existing: CanvasImageSource | null,
  ): MaskSession {
    const session = new MaskSession(layerWidth, layerHeight);
    const ctx = session.canvas.getContext("2d");
    if (ctx !== null) {
      if (existing === null) {
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, session.canvas.width, session.canvas.height);
      } else {
        ctx.drawImage(existing, 0, 0, session.canvas.width, session.canvas.height);
      }
    }
    return session;
  }

  /** Reveal (`brush`) or hide (`eraser`) with one stroke. */
  paint(stroke: PaintStroke): void {
    const ctx = this.canvas.getContext("2d");
    if (ctx === null) return;
    drawStroke(ctx, stroke, { x0: 0, y0: 0, scale: this.scale });
  }

  /** A copy of the picture for the engine (it takes ownership of the bitmap). */
  snapshot(): Promise<ImageBitmap> {
    return createImageBitmap(this.canvas, { premultiplyAlpha: "premultiply" });
  }

  toPng(): Promise<Blob> {
    return this.canvas.convertToBlob({ type: "image/png" });
  }
}
