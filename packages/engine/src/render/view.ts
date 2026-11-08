import { multiply, scale, translate, type Mat } from "../math/matrix.ts";

/**
 * A window onto a composition: the part of it to draw (composition pixels) and how many output
 * pixels there are per composition pixel. A 6000 px photo drawn at fit-zoom is a window of the whole
 * composition at scale 0.25 (a 1500 px render), and the same window at scale 1, in tiles, is how
 * a full-resolution export is drawn.
 */
export interface ViewWindow {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
}

/** Output size in pixels (at least 1×1). */
export function viewSize(view: ViewWindow): { width: number; height: number } {
  return {
    width: Math.max(1, Math.round(view.width * view.scale)),
    height: Math.max(1, Math.round(view.height * view.scale)),
  };
}

/** Composition pixels -> output pixels. */
export function viewMatrix(view: ViewWindow): Mat {
  return multiply(scale(view.scale, view.scale), translate(-view.x, -view.y));
}
