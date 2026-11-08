import {
  applyToPoint,
  multiply,
  rotate,
  scale as scaleMat,
  translate,
  layerMatrix,
  type Mat,
} from "@lumacut/engine";
import type { Clip, Composition, Op, Transform } from "@lumacut/schema";

/**
 * A change to the canvas: its new size, and where every point of the old canvas goes
 * (`map`: old canvas pixels → new canvas pixels). Cropping, rotating, straightening, flipping and
 * resizing are all one of these; applying it moves every layer by `map`, so nothing is destroyed
 * and undo is exact.
 */
export interface CanvasEdit {
  width: number;
  height: number;
  map: Mat;
}

const whole = (n: number): number => Math.max(1, Math.round(n));

/** Keep only the rectangle (x, y, width, height) of the canvas. */
export function cropEdit(
  rect: { x: number; y: number; width: number; height: number },
  limit?: { width: number; height: number },
): CanvasEdit {
  let { x, y, width, height } = rect;
  if (limit !== undefined) {
    x = Math.min(Math.max(0, x), limit.width - 1);
    y = Math.min(Math.max(0, y), limit.height - 1);
    width = Math.min(width, limit.width - x);
    height = Math.min(height, limit.height - y);
  }
  const rx = Math.round(x);
  const ry = Math.round(y);
  return { width: whole(width), height: whole(height), map: translate(-rx, -ry) };
}

/** Turn the canvas a quarter turn: `1` clockwise, `-1` anticlockwise. */
export function rotate90Edit(
  comp: { width: number; height: number },
  direction: 1 | -1,
): CanvasEdit {
  const { width: w, height: h } = comp;
  return {
    width: h,
    height: w,
    map: multiply(
      translate(h / 2, w / 2),
      multiply(rotate(90 * direction), translate(-w / 2, -h / 2)),
    ),
  };
}

/**
 * The largest rectangle with the canvas's own proportions that fits inside the canvas turned by
 * `degrees` (no empty corners), as a fraction of the canvas size.
 */
export function straightenScale(comp: { width: number; height: number }, degrees: number): number {
  const r = (degrees * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  const { width: w, height: h } = comp;
  return Math.min(1, w / (w * c + h * s), h / (w * s + h * c));
}

/** Rotate every layer by `degrees` (clockwise) about the middle, then crop away the empty corners. */
export function straightenEdit(
  comp: { width: number; height: number },
  degrees: number,
): CanvasEdit {
  const k = straightenScale(comp, degrees);
  const width = whole(comp.width * k);
  const height = whole(comp.height * k);
  return {
    width,
    height,
    map: multiply(
      translate(width / 2, height / 2),
      multiply(rotate(degrees), translate(-comp.width / 2, -comp.height / 2)),
    ),
  };
}

/** Mirror the canvas left-right (`horizontal`) or top-bottom. */
export function flipEdit(
  comp: { width: number; height: number },
  axis: "horizontal" | "vertical",
): CanvasEdit {
  return {
    width: comp.width,
    height: comp.height,
    map:
      axis === "horizontal"
        ? multiply(translate(comp.width, 0), scaleMat(-1, 1))
        : multiply(translate(0, comp.height), scaleMat(1, -1)),
  };
}

export type Anchor =
  | "topLeft"
  | "top"
  | "topRight"
  | "left"
  | "center"
  | "right"
  | "bottomLeft"
  | "bottom"
  | "bottomRight";

const ANCHOR_FRACTION: Record<Anchor, [number, number]> = {
  topLeft: [0, 0],
  top: [0.5, 0],
  topRight: [1, 0],
  left: [0, 0.5],
  center: [0.5, 0.5],
  right: [1, 0.5],
  bottomLeft: [0, 1],
  bottom: [0.5, 1],
  bottomRight: [1, 1],
};

/**
 * A new canvas size. The old picture sits at `anchor`; with `scaleContent` it is first scaled
 * (keeping its proportions) to fit the new size, otherwise it keeps its pixels and the canvas
 * grows or shrinks around it.
 */
export function resizeEdit(
  comp: { width: number; height: number },
  width: number,
  height: number,
  anchor: Anchor,
  scaleContent: boolean,
): CanvasEdit {
  const nw = whole(width);
  const nh = whole(height);
  const k = scaleContent ? Math.min(nw / comp.width, nh / comp.height) : 1;
  const [fx, fy] = ANCHOR_FRACTION[anchor];
  const dx = (nw - comp.width * k) * fx;
  const dy = (nh - comp.height * k) * fy;
  return { width: nw, height: nh, map: multiply(translate(dx, dy), scaleMat(k, k)) };
}

const degrees = (rad: number): number => (rad * 180) / Math.PI;

/**
 * The transform a layer needs so it ends up where `map · (its old matrix)` puts it, keeping its
 * anchor. A mirrored result comes out as a negative X scale (a flip), not a half-turn plus a
 * negative Y scale.
 */
export function transformUnder(t: Transform, map: Mat): Transform {
  const n = multiply(map, layerMatrix(t));
  const [px, py] = applyToPoint(n, [t.anchorX, t.anchorY]);
  const det = n[0] * n[3] - n[1] * n[2];
  const flipped = det < 0;
  // First column of the linear part is R·(sx, 0): its length and direction give sx and the rotation.
  const sx = Math.hypot(n[0], n[1]) * (flipped ? -1 : 1);
  const angle = Math.atan2(flipped ? -n[1] : n[1], flipped ? -n[0] : n[0]);
  // Second column is R·(−tan(skew)·sy, sy): undo the rotation to read sy and the skew.
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const u1 = c * n[2] + s * n[3];
  const u2 = -s * n[2] + c * n[3];
  const sy = u2;
  const skew = sy === 0 ? 0 : degrees(Math.atan(-u1 / sy));
  return {
    ...t,
    x: px,
    y: py,
    scaleX: sx,
    scaleY: sy,
    rotation: normalizeDegrees(degrees(angle)),
    skew,
  };
}

function normalizeDegrees(d: number): number {
  let r = d % 360;
  if (r > 180) r -= 360;
  if (r <= -180) r += 360;
  // Clean up floating point noise (89.99999999 → 90).
  return Math.round(r * 1e9) / 1e9;
}

/** Clips on picture tracks whose transform is animated (their keyframes would no longer fit). */
export function animatedLayers(comp: Composition): Clip[] {
  return comp.tracks
    .filter((t) => t.kind === "visual")
    .flatMap((t) => t.clips)
    .filter((c) =>
      Object.entries(c.keyframes).some(
        ([path, frames]) => path.startsWith("transform.") && frames.length > 0,
      ),
    );
}

/** The ops that carry out a canvas edit: the new size, and every picture layer moved by `map`. */
export function canvasEditOps(comp: Composition, edit: CanvasEdit): Op[] {
  const ops: Op[] = [
    {
      type: "updateComposition",
      compositionId: comp.id,
      props: { width: edit.width, height: edit.height },
    },
  ];
  for (const track of comp.tracks) {
    if (track.kind !== "visual") continue;
    for (const clip of track.clips) {
      // Colour fills and adjustment layers always cover the whole canvas, whatever its size.
      if (clip.type === "solid" || clip.type === "adjustment") continue;
      ops.push({
        type: "setProps",
        clipId: clip.id,
        props: { transform: transformUnder(clip.transform, edit.map) },
      });
    }
  }
  return ops;
}
