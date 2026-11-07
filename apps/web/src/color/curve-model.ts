import { FLAT_CURVE, NEUTRAL_CURVE } from "@lumacut/engine/color";
import type { ColorSettings, Vec2 } from "@lumacut/schema";

export type CurveName = "master" | "r" | "g" | "b" | "hueVsSat" | "hueVsHue" | "lumVsSat";

export const CURVE_INFO: Record<CurveName, { label: string; description: string; flat: boolean }> =
  {
    master: {
      label: "Luma",
      description: "Tone curve for all channels (display values).",
      flat: false,
    },
    r: { label: "Red", description: "Tone curve for the red channel.", flat: false },
    g: { label: "Green", description: "Tone curve for the green channel.", flat: false },
    b: { label: "Blue", description: "Tone curve for the blue channel.", flat: false },
    hueVsSat: {
      label: "Hue vs saturation",
      description: "Raise a hue's saturation above the middle line, lower it below.",
      flat: true,
    },
    hueVsHue: {
      label: "Hue vs hue",
      description: "Shift a hue towards a neighbouring one.",
      flat: true,
    },
    lumVsSat: {
      label: "Luma vs saturation",
      description: "Change saturation by brightness.",
      flat: true,
    },
  };
export const CURVE_NAMES = Object.keys(CURVE_INFO) as CurveName[];

const MIN_GAP = 0.005;
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

export const neutralPoints = (name: CurveName): Vec2[] =>
  (CURVE_INFO[name].flat ? FLAT_CURVE : NEUTRAL_CURVE).map(([x, y]): Vec2 => [x, y]);

/** The points of a curve, or its neutral line when the clip has none. */
export function pointsOf(color: ColorSettings, name: CurveName): Vec2[] {
  const stored = color.curves?.[name];
  return stored === undefined ? neutralPoints(name) : stored.map(([x, y]): Vec2 => [x, y]);
}

/** Adds a point at (x, y); a point already within a hair of x is moved instead. Returns the new points and the index. */
export function addPoint(
  points: readonly Vec2[],
  x: number,
  y: number,
): { points: Vec2[]; index: number } {
  const px = clamp01(x);
  const py = clamp01(y);
  const near = points.findIndex(([ox]) => Math.abs(ox - px) < MIN_GAP);
  if (near >= 0) {
    const next = points.map(([ox, oy], i): Vec2 => (i === near ? [ox, py] : [ox, oy]));
    return { points: next, index: near };
  }
  const next: Vec2[] = [...points.map(([ox, oy]): Vec2 => [ox, oy]), [px, py]];
  next.sort((a, b) => a[0] - b[0]);
  return { points: next, index: next.findIndex(([ox]) => ox === px) };
}

/** Moves a point; its x stays between its neighbours, and the end points only move up and down. */
export function movePoint(points: readonly Vec2[], index: number, x: number, y: number): Vec2[] {
  const here = points[index];
  if (here === undefined) return points.map(([ox, oy]): Vec2 => [ox, oy]);
  const last = points.length - 1;
  const lo = index === 0 ? here[0] : (points[index - 1]?.[0] ?? 0) + MIN_GAP;
  const hi = index === last ? here[0] : (points[index + 1]?.[0] ?? 1) - MIN_GAP;
  const nx = index === 0 || index === last ? here[0] : Math.min(hi, Math.max(lo, x));
  return points.map(([ox, oy], i): Vec2 => (i === index ? [nx, clamp01(y)] : [ox, oy]));
}

/** Removes an inner point (the two end points and the minimum of two points stay). */
export function removePoint(points: readonly Vec2[], index: number): Vec2[] {
  if (index <= 0 || index >= points.length - 1 || points.length <= 2) {
    return points.map(([ox, oy]): Vec2 => [ox, oy]);
  }
  return points.filter((_, i) => i !== index).map(([ox, oy]): Vec2 => [ox, oy]);
}

/** The colour settings with one curve replaced (others keep their points or their neutral line). */
export function withCurve(
  color: ColorSettings,
  name: CurveName,
  points: readonly Vec2[],
): ColorSettings {
  const base = {
    master: pointsOf(color, "master"),
    r: pointsOf(color, "r"),
    g: pointsOf(color, "g"),
    b: pointsOf(color, "b"),
    ...(color.curves?.hueVsSat === undefined ? {} : { hueVsSat: pointsOf(color, "hueVsSat") }),
    ...(color.curves?.hueVsHue === undefined ? {} : { hueVsHue: pointsOf(color, "hueVsHue") }),
    ...(color.curves?.lumVsSat === undefined ? {} : { lumVsSat: pointsOf(color, "lumVsSat") }),
  };
  return { ...color, curves: { ...base, [name]: points.map(([x, y]): Vec2 => [x, y]) } };
}
