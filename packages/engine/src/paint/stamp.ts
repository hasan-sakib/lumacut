import type { PaintStroke } from "@lumacut/schema";

/** One round dab of a brush, in layer pixels. `radius` already includes pressure. */
export interface Stamp {
  x: number;
  y: number;
  radius: number;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** How much of the brush size a pressure gives: a feather touch still leaves a mark. */
export const pressureFactor = (pressure: number): number => 0.2 + 0.8 * clamp01(pressure);

/** Points of a stroke as (x, y, pressure) triples. A stray trailing value is ignored. */
export function strokePoints(stroke: PaintStroke): { x: number; y: number; p: number }[] {
  const out: { x: number; y: number; p: number }[] = [];
  const v = stroke.points;
  for (let i = 0; i + 2 < v.length; i += 3) {
    out.push({ x: v[i] ?? 0, y: v[i + 1] ?? 0, p: v[i + 2] ?? 1 });
  }
  return out;
}

/**
 * Dabs along the polyline of a stroke, evenly spaced (a fraction of the brush's diameter, never
 * less than `minSpacing` layer pixels) with pressure interpolated between points. The same stroke
 * always gives the same stamps: there is no randomness anywhere in painting.
 */
export function strokeStamps(stroke: PaintStroke, minSpacing = 0.5): Stamp[] {
  const points = strokePoints(stroke);
  const first = points[0];
  if (first === undefined) return [];
  const radiusAt = (p: number): number => (stroke.size / 2) * pressureFactor(p);
  const stamps: Stamp[] = [{ x: first.x, y: first.y, radius: radiusAt(first.p) }];
  let carry = 0; // distance since the last stamp
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (a === undefined || b === undefined) continue;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length === 0) continue;
    let travelled = 0;
    for (;;) {
      const radius = radiusAt(a.p + ((b.p - a.p) * travelled) / length);
      const spacing = Math.max(minSpacing, radius * 2 * 0.1);
      const next = travelled + Math.max(0.001, spacing - carry);
      if (next > length) {
        carry += length - travelled;
        break;
      }
      travelled = next;
      carry = 0;
      const t = travelled / length;
      stamps.push({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        radius: radiusAt(a.p + (b.p - a.p) * t),
      });
    }
  }
  return stamps;
}

/** The layer-pixel box a stroke can touch (stamps plus a pixel for antialiasing). */
export function strokeBounds(
  stroke: PaintStroke,
): { x0: number; y0: number; x1: number; y1: number } | null {
  const points = strokePoints(stroke);
  if (points.length === 0) return null;
  const reach = stroke.size / 2 + 1;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const { x, y } of points) {
    x0 = Math.min(x0, x - reach);
    y0 = Math.min(y0, y - reach);
    x1 = Math.max(x1, x + reach);
    y1 = Math.max(y1, y + reach);
  }
  return { x0, y0, x1, y1 };
}
