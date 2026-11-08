import type { BezierPath, ShapeItem, Vec2 } from "@lumacut/schema";

/** One cubic Bézier piece of an outline (a straight line has its control points on the line). */
export interface Seg {
  p0: Vec2;
  c1: Vec2;
  c2: Vec2;
  p1: Vec2;
}

export interface Outline {
  segs: Seg[];
  closed: boolean;
}

const KAPPA = 0.5522847498; // control-point distance for a quarter circle

const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const scale = (a: Vec2, k: number): Vec2 => [a[0] * k, a[1] * k];
const len = (a: Vec2): number => Math.hypot(a[0], a[1]);
const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];

const line = (p0: Vec2, p1: Vec2): Seg => ({
  p0,
  c1: lerp(p0, p1, 1 / 3),
  c2: lerp(p0, p1, 2 / 3),
  p1,
});

/** A closed or open polyline as an outline. */
function polyline(points: readonly Vec2[], closed: boolean): Outline {
  const segs: Seg[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (a !== undefined && b !== undefined) segs.push(line(a, b));
  }
  const first = points[0];
  const last = points[points.length - 1];
  if (closed && first !== undefined && last !== undefined && points.length > 2) {
    segs.push(line(last, first));
  }
  return { segs, closed };
}

/**
 * A polygon whose corners are rounded: at each vertex the corner is cut `radii[i]` px back along
 * both edges (never more than half the shorter edge) and joined with a smooth curve.
 */
export function roundedPolygon(
  points: readonly Vec2[],
  radii: readonly number[],
  closed = true,
): Outline {
  const n = points.length;
  if (n < 3 || radii.every((r) => r <= 0)) return polyline(points, closed);
  interface Corner {
    a: Vec2;
    b: Vec2;
    p: Vec2;
    round: boolean;
  }
  const corners: Corner[] = points.map((p, i) => {
    const prev = points[(i + n - 1) % n] ?? p;
    const next = points[(i + 1) % n] ?? p;
    const open = !closed && (i === 0 || i === n - 1);
    const toPrev = sub(prev, p);
    const toNext = sub(next, p);
    const lp = len(toPrev);
    const ln = len(toNext);
    const d = open ? 0 : Math.min(radii[i] ?? 0, lp / 2, ln / 2);
    if (d <= 0.0001 || lp === 0 || ln === 0) return { a: p, b: p, p, round: false };
    return { a: add(p, scale(toPrev, d / lp)), b: add(p, scale(toNext, d / ln)), p, round: true };
  });
  const segs: Seg[] = [];
  const count = closed ? n : n - 1;
  for (let i = 0; i < count; i++) {
    const here = corners[i];
    const there = corners[(i + 1) % n];
    if (here === undefined || there === undefined) continue;
    segs.push(line(here.b, there.a));
  }
  // The rounded corners, as curves between the straight pieces.
  const out: Seg[] = [];
  for (let i = 0; i < n; i++) {
    const c = corners[i];
    if (c === undefined) continue;
    if (c.round) {
      out.push({
        p0: c.a,
        c1: lerp(c.a, c.p, KAPPA),
        c2: lerp(c.b, c.p, KAPPA),
        p1: c.b,
      });
    }
    const straight = segs[closed ? i : i];
    if (straight !== undefined && (closed || i < count)) out.push(straight);
  }
  // Put each curve before the straight piece that starts at its end: order is corner i, edge i.
  return { segs: out, closed };
}

/** Rectangle centred on `position`. `roundness` is the corner radius in px. */
export function rectOutline(item: Extract<ShapeItem, { kind: "rect" }>, roundCorners = 0): Outline {
  const [cx, cy] = item.position;
  const hw = Math.abs(item.size[0]) / 2;
  const hh = Math.abs(item.size[1]) / 2;
  const radius = Math.min(Math.max(item.roundness, roundCorners), hw, hh);
  const points: Vec2[] = [
    [cx - hw, cy - hh],
    [cx + hw, cy - hh],
    [cx + hw, cy + hh],
    [cx - hw, cy + hh],
  ];
  return roundedPolygon(points, [radius, radius, radius, radius]);
}

export function ellipseOutline(item: Extract<ShapeItem, { kind: "ellipse" }>): Outline {
  const [cx, cy] = item.position;
  const rx = Math.abs(item.size[0]) / 2;
  const ry = Math.abs(item.size[1]) / 2;
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  const top: Vec2 = [cx, cy - ry];
  const right: Vec2 = [cx + rx, cy];
  const bottom: Vec2 = [cx, cy + ry];
  const left: Vec2 = [cx - rx, cy];
  return {
    closed: true,
    segs: [
      { p0: top, c1: [cx + kx, cy - ry], c2: [cx + rx, cy - ky], p1: right },
      { p0: right, c1: [cx + rx, cy + ky], c2: [cx + kx, cy + ry], p1: bottom },
      { p0: bottom, c1: [cx - kx, cy + ry], c2: [cx - rx, cy + ky], p1: left },
      { p0: left, c1: [cx - rx, cy - ky], c2: [cx - kx, cy - ry], p1: top },
    ],
  };
}

const polar = (centre: Vec2, radius: number, degrees: number): Vec2 => {
  const a = (degrees * Math.PI) / 180;
  return [centre[0] + Math.cos(a) * radius, centre[1] + Math.sin(a) * radius];
};

export function polygonOutline(
  item: Extract<ShapeItem, { kind: "polygon" }>,
  roundCorners = 0,
): Outline {
  const n = Math.max(3, Math.round(item.points));
  const points = Array.from({ length: n }, (_, k) =>
    polar(item.position, item.radius, item.rotation - 90 + (k * 360) / n),
  );
  const radius = Math.max(item.roundness, roundCorners);
  return roundedPolygon(
    points,
    points.map(() => radius),
  );
}

export function starOutline(item: Extract<ShapeItem, { kind: "star" }>, roundCorners = 0): Outline {
  const n = Math.max(3, Math.round(item.points));
  const points: Vec2[] = [];
  const radii: number[] = [];
  for (let k = 0; k < n * 2; k++) {
    const outer = k % 2 === 0;
    points.push(
      polar(
        item.position,
        outer ? item.outerRadius : item.innerRadius,
        item.rotation - 90 + (k * 180) / n,
      ),
    );
    radii.push(Math.max(outer ? item.outerRoundness : item.innerRoundness, roundCorners));
  }
  return roundedPolygon(points, radii);
}

/** A pen path: vertices with tangents relative to the point (After Effects convention). */
export function pathOutline(path: BezierPath, roundCorners = 0): Outline {
  const v = path.vertices;
  if (v.length < 2) return { segs: [], closed: path.closed };
  const sharp = v.every(
    (p) =>
      p.inTangent[0] === 0 &&
      p.inTangent[1] === 0 &&
      p.outTangent[0] === 0 &&
      p.outTangent[1] === 0,
  );
  if (sharp && roundCorners > 0 && v.length >= 3) {
    return roundedPolygon(
      v.map((p) => p.point),
      v.map(() => roundCorners),
      path.closed,
    );
  }
  const segs: Seg[] = [];
  const count = path.closed ? v.length : v.length - 1;
  for (let i = 0; i < count; i++) {
    const a = v[i];
    const b = v[(i + 1) % v.length];
    if (a === undefined || b === undefined) continue;
    segs.push({
      p0: a.point,
      c1: add(a.point, a.outTangent),
      c2: add(b.point, b.inTangent),
      p1: b.point,
    });
  }
  return { segs, closed: path.closed };
}

export function itemOutline(item: ShapeItem, roundCorners = 0): Outline {
  switch (item.kind) {
    case "rect":
      return rectOutline(item, roundCorners);
    case "ellipse":
      return ellipseOutline(item);
    case "polygon":
      return polygonOutline(item, roundCorners);
    case "star":
      return starOutline(item, roundCorners);
    case "path":
      return pathOutline(item.path, roundCorners);
  }
}

/** Adds an outline's pieces to a `Path2D` (or any canvas path). */
export function addOutline(path: Path2D, outline: Outline): void {
  const first = outline.segs[0];
  if (first === undefined) return;
  path.moveTo(first.p0[0], first.p0[1]);
  for (const s of outline.segs)
    path.bezierCurveTo(s.c1[0], s.c1[1], s.c2[0], s.c2[1], s.p1[0], s.p1[1]);
  if (outline.closed) path.closePath();
}

const cubicPoint = (s: Seg, t: number): Vec2 => {
  const u = 1 - t;
  const w0 = u * u * u;
  const w1 = 3 * u * u * t;
  const w2 = 3 * u * t * t;
  const w3 = t * t * t;
  return [
    w0 * s.p0[0] + w1 * s.c1[0] + w2 * s.c2[0] + w3 * s.p1[0],
    w0 * s.p0[1] + w1 * s.c1[1] + w2 * s.c2[1] + w3 * s.p1[1],
  ];
};

/** Length of an outline (each piece sampled at 24 points). */
export function outlineLength(outline: Outline): number {
  let total = 0;
  for (const s of outline.segs) {
    let prev = s.p0;
    for (let i = 1; i <= 24; i++) {
      const p = cubicPoint(s, i / 24);
      total += len(sub(p, prev));
      prev = p;
    }
  }
  return total;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** A box that holds every control point of the outline (always contains the curve). */
export function outlineBounds(outline: Outline): Bounds | null {
  let b: Bounds | null = null;
  for (const s of outline.segs) {
    for (const p of [s.p0, s.c1, s.c2, s.p1]) {
      b =
        b === null
          ? { minX: p[0], minY: p[1], maxX: p[0], maxY: p[1] }
          : {
              minX: Math.min(b.minX, p[0]),
              minY: Math.min(b.minY, p[1]),
              maxX: Math.max(b.maxX, p[0]),
              maxY: Math.max(b.maxY, p[1]),
            };
    }
  }
  return b;
}
