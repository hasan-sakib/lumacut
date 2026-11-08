import { applyToPoint, invert, type Mat } from "@lumacut/engine";
import { animatedClip } from "@lumacut/ops";
import type { BezierPath, Clip, Composition, Mask, Project } from "@lumacut/schema";
import { ellipsePath, newPathMask, rectPath } from "../inspector/masks.ts";
import { layerBoxOf, layerToComp } from "../overlay/layer-box.ts";
import type { Point } from "../overlay/viewport.ts";
import type { Selection } from "./types.ts";

/** A rectangle selection through two corners (any order). */
export function rectSelection(a: Point, b: Point): BezierPath {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(a.x - b.x);
  const h = Math.abs(a.y - b.y);
  return rectPath(x + w / 2, y + h / 2, w, h);
}

/** An ellipse selection inscribed in the rectangle through two corners. */
export function ellipseSelection(a: Point, b: Point): BezierPath {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(a.x - b.x);
  const h = Math.abs(a.y - b.y);
  return ellipsePath(x + w / 2, y + h / 2, w, h);
}

/** Drops points closer than `minDistance` to the last kept one (a freehand lasso has hundreds). */
export function simplifyLasso(points: readonly Point[], minDistance = 2): Point[] {
  const kept: Point[] = [];
  for (const p of points) {
    const last = kept[kept.length - 1];
    if (last === undefined || Math.hypot(p.x - last.x, p.y - last.y) >= minDistance) kept.push(p);
  }
  return kept;
}

/** A lasso selection: the polygon through the dragged points (straight edges, closed). */
export function lassoSelection(points: readonly Point[]): BezierPath | null {
  const kept = simplifyLasso(points);
  if (kept.length < 3) return null;
  return {
    closed: true,
    vertices: kept.map((p) => ({
      point: [p.x, p.y] as [number, number],
      inTangent: [0, 0] as [number, number],
      outTangent: [0, 0] as [number, number],
    })),
  };
}

/** The whole canvas. */
export const allSelection = (comp: { width: number; height: number }): BezierPath =>
  rectPath(comp.width / 2, comp.height / 2, comp.width, comp.height);

/** The box around the selection's vertices, in canvas pixels (curves can bulge a little past it). */
export function selectionBounds(
  path: BezierPath,
): { x: number; y: number; width: number; height: number } | null {
  if (path.vertices.length === 0) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const v of path.vertices) {
    x0 = Math.min(x0, v.point[0]);
    y0 = Math.min(y0, v.point[1]);
    x1 = Math.max(x1, v.point[0]);
    y1 = Math.max(y1, v.point[1]);
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** Is a selection worth keeping (not a click that dragged nowhere)? */
export function isUsable(path: BezierPath): boolean {
  const b = selectionBounds(path);
  return b !== null && b.width >= 2 && b.height >= 2;
}

export const invertSelection = (selection: Selection): Selection => ({
  ...selection,
  inverted: !selection.inverted,
});

/** Canvas pixels → a clip's own picture pixels, for a clip at `localUs` of its own time. */
export function canvasToLayer(
  clip: Clip,
  project: Project,
  comp: Composition,
  localUs: number,
): Mat {
  const animated = animatedClip(clip, localUs);
  const box = layerBoxOf(animated, project, comp, localUs);
  return invert(layerToComp(animated, box));
}

/** The selection's path in a clip's own picture pixels (tangents are offsets, mapped as vectors). */
export function pathToLayer(path: BezierPath, inverse: Mat): BezierPath {
  const point = (p: [number, number]): [number, number] => {
    const q = applyToPoint(inverse, p);
    return [q[0], q[1]];
  };
  const vector = (v: [number, number]): [number, number] => [
    inverse[0] * v[0] + inverse[2] * v[1],
    inverse[1] * v[0] + inverse[3] * v[1],
  ];
  return {
    closed: true,
    vertices: path.vertices.map((v) => ({
      point: point(v.point),
      inTangent: vector(v.inTangent),
      outTangent: vector(v.outTangent),
    })),
  };
}

/**
 * A layer mask made from the selection: its path moved into the layer's picture, feathered by the
 * selection's softness (canvas pixels become layer pixels at the layer's drawn scale), inverted
 * when the selection is.
 */
export function selectionToMask(
  selection: Selection,
  clip: Clip,
  project: Project,
  comp: Composition,
  playheadUs: number,
  id: string,
  mode: Mask["mode"],
): Mask {
  const local = Math.max(0, playheadUs - clip.startUs);
  const inverse = canvasToLayer(clip, project, comp, local);
  const layerPerCanvas = Math.hypot(inverse[0], inverse[1]);
  const base = newPathMask(id, pathToLayer(selection.path, inverse));
  return {
    ...base,
    mode,
    inverted: selection.inverted,
    feather: Math.max(0, selection.feather * layerPerCanvas),
  };
}
