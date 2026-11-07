import type { Vec2 } from "@lumacut/schema";

export const CURVE_SIZE = 256;

/** The curve rows packed into one texture, in this order. */
export const CURVE_ROWS = ["master", "r", "g", "b", "hueVsSat", "hueVsHue", "lumVsSat"] as const;
export type CurveRow = (typeof CURVE_ROWS)[number];

/** Identity for the tone curves, flat 0.5 (no change) for the hue/luminance curves. */
export const NEUTRAL_CURVE: readonly Vec2[] = [
  [0, 0],
  [1, 1],
];
export const FLAT_CURVE: readonly Vec2[] = [
  [0, 0.5],
  [1, 0.5],
];

/**
 * A monotone cubic (Fritsch–Carlson) through the control points, sampled at CURVE_SIZE evenly
 * spaced x values in [0, 1]. Outside the first/last point the curve holds the end value. Monotone
 * means the curve never overshoots between points, so it can't invert tones by accident.
 */
export function sampleCurve(points: readonly Vec2[]): Float32Array {
  const sorted = [...points].sort((a, b) => a[0] - b[0]);
  // Drop duplicate x values (keep the last one given).
  const pts = sorted.filter((p, i) => i === sorted.length - 1 || sorted[i + 1]?.[0] !== p[0]);
  const out = new Float32Array(CURVE_SIZE);
  const n = pts.length;
  const first = pts[0];
  const last = pts[n - 1];
  if (first === undefined || last === undefined) return out.fill(0);
  if (n === 1) return out.fill(first[1]);

  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = pts[i] ?? first;
    const b = pts[i + 1] ?? last;
    dx.push(b[0] - a[0]);
    slope.push((b[1] - a[1]) / (b[0] - a[0]));
  }
  const m: number[] = new Array<number>(n).fill(0);
  m[0] = slope[0] ?? 0;
  m[n - 1] = slope[n - 2] ?? 0;
  for (let i = 1; i < n - 1; i++) {
    const s0 = slope[i - 1] ?? 0;
    const s1 = slope[i] ?? 0;
    m[i] = s0 * s1 <= 0 ? 0 : (s0 + s1) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    const s = slope[i] ?? 0;
    if (s === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = (m[i] ?? 0) / s;
    const b = (m[i + 1] ?? 0) / s;
    const h = Math.hypot(a, b);
    if (h > 3) {
      m[i] = ((3 * a) / h) * s;
      m[i + 1] = ((3 * b) / h) * s;
    }
  }

  let seg = 0;
  for (let k = 0; k < CURVE_SIZE; k++) {
    const x = k / (CURVE_SIZE - 1);
    if (x <= first[0]) {
      out[k] = first[1];
      continue;
    }
    if (x >= last[0]) {
      out[k] = last[1];
      continue;
    }
    while (seg < n - 2 && x > (pts[seg + 1]?.[0] ?? Infinity)) seg++;
    const a = pts[seg] ?? first;
    const b = pts[seg + 1] ?? last;
    const h = dx[seg] ?? 1;
    const t = (x - a[0]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    out[k] =
      (2 * t3 - 3 * t2 + 1) * a[1] +
      (t3 - 2 * t2 + t) * h * (m[seg] ?? 0) +
      (-2 * t3 + 3 * t2) * b[1] +
      (t3 - t2) * h * (m[seg + 1] ?? 0);
  }
  return out;
}

/** The 7 rows of a clip's curves as one flat table (row-major), for upload as a 256×7 texture. */
export function curveTable(
  curves:
    | {
        master: readonly Vec2[];
        r: readonly Vec2[];
        g: readonly Vec2[];
        b: readonly Vec2[];
        hueVsSat?: readonly Vec2[] | undefined;
        hueVsHue?: readonly Vec2[] | undefined;
        lumVsSat?: readonly Vec2[] | undefined;
      }
    | undefined,
): Float32Array {
  const table = new Float32Array(CURVE_SIZE * CURVE_ROWS.length);
  const rows: Record<CurveRow, readonly Vec2[]> = {
    master: curves?.master ?? NEUTRAL_CURVE,
    r: curves?.r ?? NEUTRAL_CURVE,
    g: curves?.g ?? NEUTRAL_CURVE,
    b: curves?.b ?? NEUTRAL_CURVE,
    hueVsSat: curves?.hueVsSat ?? FLAT_CURVE,
    hueVsHue: curves?.hueVsHue ?? FLAT_CURVE,
    lumVsSat: curves?.lumVsSat ?? FLAT_CURVE,
  };
  CURVE_ROWS.forEach((name, row) => {
    table.set(sampleCurve(rows[name]), row * CURVE_SIZE);
  });
  return table;
}

/** Reads a table row at x in [0, 1] with linear interpolation (what the shader's sampler does). */
export function lookupCurve(table: Float32Array, row: number, x: number): number {
  const f = Math.min(1, Math.max(0, x)) * (CURVE_SIZE - 1);
  const i = Math.min(CURVE_SIZE - 2, Math.floor(f));
  const t = f - i;
  const base = row * CURVE_SIZE;
  const a = table[base + i] ?? 0;
  const b = table[base + i + 1] ?? a;
  return a + (b - a) * t;
}
