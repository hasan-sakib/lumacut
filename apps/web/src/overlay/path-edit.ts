import { pathOutline } from "@lumacut/engine/shapes";
import type { BezierPath, BezierVertex, Vec2 } from "@lumacut/schema";

const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const mul = (a: Vec2, k: number): Vec2 => [a[0] * k, a[1] * k];
const len = (a: Vec2): number => Math.hypot(a[0], a[1]);
const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];
const ZERO: Vec2 = [0, 0];

const withVertex = (path: BezierPath, i: number, v: BezierVertex): BezierPath => ({
  ...path,
  vertices: path.vertices.map((x, k) => (k === i ? v : x)),
});

/** Moves a vertex (its tangents are relative to it, so they come along). */
export function movePoint(path: BezierPath, index: number, to: Vec2): BezierPath {
  const v = path.vertices[index];
  return v === undefined ? path : withVertex(path, index, { ...v, point: to });
}

/**
 * Drags the outgoing tangent handle to `handle` (absolute). A smooth vertex keeps its two tangents
 * opposite each other; with `broken` only this one moves.
 */
export function setOutTangent(
  path: BezierPath,
  index: number,
  handle: Vec2,
  broken = false,
): BezierPath {
  const v = path.vertices[index];
  if (v === undefined) return path;
  const out = sub(handle, v.point);
  return withVertex(path, index, {
    ...v,
    outTangent: out,
    inTangent: broken ? v.inTangent : mul(out, -1),
  });
}

export function setInTangent(
  path: BezierPath,
  index: number,
  handle: Vec2,
  broken = false,
): BezierPath {
  const v = path.vertices[index];
  if (v === undefined) return path;
  const into = sub(handle, v.point);
  return withVertex(path, index, {
    ...v,
    inTangent: into,
    outTangent: broken ? v.outTangent : mul(into, -1),
  });
}

const isCorner = (v: BezierVertex): boolean =>
  v.inTangent[0] === 0 && v.inTangent[1] === 0 && v.outTangent[0] === 0 && v.outTangent[1] === 0;

/** Corner → smooth (tangents along the line between its neighbours) and back. */
export function toggleSmooth(path: BezierPath, index: number): BezierPath {
  const v = path.vertices[index];
  if (v === undefined) return path;
  if (!isCorner(v)) return withVertex(path, index, { ...v, inTangent: ZERO, outTangent: ZERO });
  const n = path.vertices.length;
  const prev = path.vertices[index - 1] ?? (path.closed ? path.vertices[n - 1] : undefined);
  const next = path.vertices[index + 1] ?? (path.closed ? path.vertices[0] : undefined);
  const a = prev?.point ?? v.point;
  const b = next?.point ?? v.point;
  const direction = sub(b, a);
  const out = mul(direction, 1 / 6);
  return withVertex(path, index, { ...v, outTangent: out, inTangent: mul(out, -1) });
}

export function removeVertex(path: BezierPath, index: number): BezierPath {
  if (path.vertices.length <= 2) return path;
  return { ...path, vertices: path.vertices.filter((_, i) => i !== index) };
}

interface Cubic {
  p0: Vec2;
  c1: Vec2;
  c2: Vec2;
  p1: Vec2;
}

function segmentOf(path: BezierPath, i: number): Cubic | undefined {
  const a = path.vertices[i];
  const b = path.vertices[(i + 1) % path.vertices.length];
  if (a === undefined || b === undefined) return undefined;
  return {
    p0: a.point,
    c1: add(a.point, a.outTangent),
    c2: add(b.point, b.inTangent),
    p1: b.point,
  };
}

const cubicAt = (s: Cubic, t: number): Vec2 => {
  const u = 1 - t;
  return add(
    add(mul(s.p0, u * u * u), mul(s.c1, 3 * u * u * t)),
    add(mul(s.c2, 3 * u * t * t), mul(s.p1, t * t * t)),
  );
};

/** The closest point of the path to `p`: which segment, how far along it, and the distance. */
export function nearestOnPath(
  path: BezierPath,
  p: Vec2,
): { segment: number; t: number; distance: number; point: Vec2 } | null {
  const count = path.closed ? path.vertices.length : path.vertices.length - 1;
  let best: { segment: number; t: number; distance: number; point: Vec2 } | null = null;
  for (let i = 0; i < count; i += 1) {
    const s = segmentOf(path, i);
    if (s === undefined) continue;
    for (let k = 0; k <= 32; k += 1) {
      const t = k / 32;
      const q = cubicAt(s, t);
      const d = len(sub(q, p));
      if (best === null || d < best.distance) best = { segment: i, t, distance: d, point: q };
    }
  }
  return best;
}

/** Adds a vertex on segment `segment` at parameter `t` without changing the curve's shape (de Casteljau). */
export function insertVertex(path: BezierPath, segment: number, t: number): BezierPath {
  const s = segmentOf(path, segment);
  const a = path.vertices[segment];
  const bIndex = (segment + 1) % path.vertices.length;
  const b = path.vertices[bIndex];
  if (s === undefined || a === undefined || b === undefined) return path;
  const q0 = lerp(s.p0, s.c1, t);
  const q1 = lerp(s.c1, s.c2, t);
  const q2 = lerp(s.c2, s.p1, t);
  const r0 = lerp(q0, q1, t);
  const r1 = lerp(q1, q2, t);
  const point = lerp(r0, r1, t);
  const created: BezierVertex = { point, inTangent: sub(r0, point), outTangent: sub(r1, point) };
  const vertices = path.vertices.map((v, i) => {
    if (i === segment) return { ...v, outTangent: sub(q0, v.point) };
    if (i === bIndex) return { ...v, inTangent: sub(q2, v.point) };
    return v;
  });
  vertices.splice(segment + 1, 0, created);
  return { ...path, vertices };
}

/** Translates a whole path. */
export function translatePath(path: BezierPath, d: Vec2): BezierPath {
  return { ...path, vertices: path.vertices.map((v) => ({ ...v, point: add(v.point, d) })) };
}

/** Maps every point of a path (tangents are offsets, so they are mapped as vectors). */
export function mapPath(
  path: BezierPath,
  point: (p: Vec2) => Vec2,
  vector: (v: Vec2) => Vec2,
): BezierPath {
  return {
    ...path,
    vertices: path.vertices.map((v) => ({
      point: point(v.point),
      inTangent: vector(v.inTangent),
      outTangent: vector(v.outTangent),
    })),
  };
}

/** The outline pieces of a path, for drawing it as an SVG `d` string. */
export function svgPath(path: BezierPath): string {
  const outline = pathOutline(path);
  const first = outline.segs[0];
  if (first === undefined) return "";
  const f = (n: number) => String(Math.round(n * 100) / 100);
  let d = `M${f(first.p0[0])} ${f(first.p0[1])}`;
  for (const s of outline.segs) {
    d += ` C${f(s.c1[0])} ${f(s.c1[1])} ${f(s.c2[0])} ${f(s.c2[1])} ${f(s.p1[0])} ${f(s.p1[1])}`;
  }
  return outline.closed ? `${d} Z` : d;
}
