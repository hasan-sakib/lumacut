import { layerMatrix, type Mat } from "@lumacut/engine";
import { shapeMetrics } from "@lumacut/engine/shapes";
import { canvasMeasurer, captionTextAt, layoutText, textMargin } from "@lumacut/engine/text";
import type { Clip, Composition, Project, TextData } from "@lumacut/schema";
import { layerSizeOf } from "../inspector/masks.ts";
import type { Point } from "./viewport.ts";

/** A clip's picture in layer pixels, and where its anchor sits in it. */
export interface LayerBox {
  width: number;
  height: number;
  /** Added to the transform's anchor (text: its centre; shapes: the shape's origin). */
  shift: Point;
}

function textBox(data: TextData): LayerBox {
  let layoutWidth = data.box?.width ?? 0;
  let layoutHeight = data.box?.height ?? 0;
  if (data.box === undefined) {
    try {
      const layout = layoutText(data, canvasMeasurer());
      layoutWidth = layout.width;
      layoutHeight = layout.height;
    } catch {
      // No canvas (tests, odd browsers): a rough guess from the font size.
      const size = data.runs[0]?.fontSize ?? 48;
      const chars = data.runs.reduce((n, r) => n + r.text.length, 0);
      layoutWidth = chars * size * 0.55;
      layoutHeight = size * data.lineHeight;
    }
  }
  const margin = textMargin(data);
  const width = Math.max(1, Math.ceil(layoutWidth) + 2 * margin);
  const height = Math.max(1, Math.ceil(layoutHeight) + 2 * margin);
  return { width, height, shift: { x: width / 2, y: height / 2 } };
}

/** The picture of a clip, for drawing handles around it (best effort for text, whose size only the engine knows exactly). */
export function layerBoxOf(clip: Clip, project: Project, comp: Composition, localUs = 0): LayerBox {
  if (clip.type === "shape" && clip.shape !== undefined) {
    const m = shapeMetrics(clip.shape);
    if (m !== null) {
      return { width: m.layerWidth, height: m.layerHeight, shift: { x: m.originX, y: m.originY } };
    }
  }
  if (clip.type === "text" && clip.text !== undefined) return textBox(clip.text);
  if (clip.type === "caption") {
    const data = captionTextAt(clip, localUs);
    if (data !== null) return textBox(data);
    return { width: comp.width * 0.6, height: 80, shift: { x: comp.width * 0.3, y: 40 } };
  }
  const size = layerSizeOf(clip, project, comp);
  return { width: size.width, height: size.height, shift: { x: 0, y: 0 } };
}

/** Layer pixels → composition pixels for a clip (its transform already evaluated at the time of interest). */
export function layerToComp(clip: Clip, box: LayerBox): Mat {
  return layerMatrix({
    ...clip.transform,
    anchorX: clip.transform.anchorX + box.shift.x,
    anchorY: clip.transform.anchorY + box.shift.y,
  });
}

export const apply = (m: Mat, x: number, y: number): Point => ({
  x: m[0] * x + m[2] * y + m[4],
  y: m[1] * x + m[3] * y + m[5],
});

/** The picture's corners in composition pixels: top-left, top-right, bottom-right, bottom-left. */
export function boxCorners(m: Mat, box: LayerBox): [Point, Point, Point, Point] {
  return [
    apply(m, 0, 0),
    apply(m, box.width, 0),
    apply(m, box.width, box.height),
    apply(m, 0, box.height),
  ];
}

/** True when `p` lies inside the quadrilateral `corners` (convex, any winding). */
export function insideQuad(corners: readonly Point[], p: Point): boolean {
  let sign = 0;
  for (let i = 0; i < corners.length; i += 1) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    if (a === undefined || b === undefined) return false;
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (cross !== 0) {
      if (sign === 0) sign = Math.sign(cross);
      else if (Math.sign(cross) !== sign) return false;
    }
  }
  return true;
}
