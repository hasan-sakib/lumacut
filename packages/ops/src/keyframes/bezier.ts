/** Cubic Bézier helpers shared by keyframe evaluation and splitting. Pure and deterministic. */

export type Point = readonly [number, number];

/** One coordinate of a cubic Bézier at parameter `u`. */
export function cubic(p0: number, p1: number, p2: number, p3: number, u: number): number {
  const v = 1 - u;
  return v * v * v * p0 + 3 * v * v * u * p1 + 3 * v * u * u * p2 + u * u * u * p3;
}

function cubicDerivative(p0: number, p1: number, p2: number, p3: number, u: number): number {
  const v = 1 - u;
  return 3 * v * v * (p1 - p0) + 6 * v * u * (p2 - p1) + 3 * u * u * (p3 - p2);
}

/**
 * The parameter `u` in [0, 1] where the curve's x equals `x`. The x control values must lie in
 * [x0, x3] (so x(u) never goes backwards). Newton's method with a bisection fallback: a fixed
 * iteration count, so the result is the same on every run.
 */
export function solveForX(x0: number, x1: number, x2: number, x3: number, x: number): number {
  if (x <= x0) return 0;
  if (x >= x3) return 1;
  let low = 0;
  let high = 1;
  let u = (x - x0) / (x3 - x0);
  // Newton steps that stay inside the bracket, bisecting whenever one would leave it. A fixed
  // iteration count keeps the result identical on every run.
  for (let i = 0; i < 80; i++) {
    const error = cubic(x0, x1, x2, x3, u) - x;
    if (Math.abs(error) < 1e-12) return u;
    if (error > 0) high = u;
    else low = u;
    const slope = cubicDerivative(x0, x1, x2, x3, u);
    const next = slope > 1e-9 ? u - error / slope : NaN;
    u = next > low && next < high ? next : (low + high) / 2;
  }
  return u;
}

export type Cubic = readonly [Point, Point, Point, Point];

const mid = (a: Point, b: Point, u: number): Point => [
  a[0] + (b[0] - a[0]) * u,
  a[1] + (b[1] - a[1]) * u,
];

/** De Casteljau: the curve cut at `u` into [0, u] and [u, 1]; both halves trace the same curve. */
export function splitCubic(curve: Cubic, u: number): [Cubic, Cubic] {
  const [p0, p1, p2, p3] = curve;
  const a = mid(p0, p1, u);
  const b = mid(p1, p2, u);
  const c = mid(p2, p3, u);
  const d = mid(a, b, u);
  const e = mid(b, c, u);
  const f = mid(d, e, u);
  return [
    [p0, a, d, f],
    [f, e, c, p3],
  ];
}
