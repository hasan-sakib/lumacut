import type { BezierPath, Color, KeyframeValue, Vec2 } from "@lumacut/schema";

/** Which kind of thing a keyframed property holds. */
export type ValueKind = "number" | "vec2" | "color" | "path";

export function kindOf(value: KeyframeValue): ValueKind {
  if (typeof value === "number") return "number";
  if (Array.isArray(value)) return "vec2";
  if ("vertices" in value) return "path";
  return "color";
}

export const isVec2 = (v: KeyframeValue): v is Vec2 => Array.isArray(v);
export const isPath = (v: KeyframeValue): v is BezierPath =>
  typeof v === "object" && !Array.isArray(v) && "vertices" in v;
export const isColor = (v: KeyframeValue): v is Color =>
  typeof v === "object" && !Array.isArray(v) && "r" in v;

// sRGB ↔ linear, so colours blend in linear light (the engine's working space).
const toLinear = (c: number): number =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
const toSrgb = (c: number): number =>
  c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

export type Linear4 = readonly [number, number, number, number];

export const colorToLinear = (c: Color): Linear4 => [
  toLinear(c.r),
  toLinear(c.g),
  toLinear(c.b),
  c.a,
];
export const colorFromLinear = (v: Linear4): Color => ({
  r: clamp01(toSrgb(clamp01(v[0]))),
  g: clamp01(toSrgb(clamp01(v[1]))),
  b: clamp01(toSrgb(clamp01(v[2]))),
  a: clamp01(v[3]),
});
