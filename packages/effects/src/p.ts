import type { Color, Vec2 } from "@lumacut/schema";
import type { BooleanParam, ColorParam, EnumParam, NumberParam, PointParam } from "./params.ts";

/** Short builders for parameter definitions. */
interface Extra {
  description?: string;
  unit?: string;
  step?: number;
  display?: number;
}

export const num = (
  id: string,
  label: string,
  value: number,
  min: number,
  max: number,
  extra: Extra = {},
): NumberParam => ({ type: "number", id, label, default: value, min, max, ...extra });

export const int = (
  id: string,
  label: string,
  value: number,
  min: number,
  max: number,
  extra: Extra = {},
): NumberParam => ({ type: "int", id, label, default: value, min, max, step: 1, ...extra });

export const percent = (
  id: string,
  label: string,
  value: number,
  min = 0,
  max = 1,
  extra: Extra = {},
): NumberParam => ({
  type: "number",
  id,
  label,
  default: value,
  min,
  max,
  step: 0.01,
  unit: "%",
  display: 100,
  ...extra,
});

export const px = (
  id: string,
  label: string,
  value: number,
  min: number,
  max: number,
  extra: Extra = {},
): NumberParam => ({ type: "number", id, label, default: value, min, max, unit: "px", ...extra });

export const degrees = (
  id: string,
  label: string,
  value: number,
  min = -360,
  max = 360,
  extra: Extra = {},
): NumberParam => ({ type: "number", id, label, default: value, min, max, unit: "°", ...extra });

export const bool = (
  id: string,
  label: string,
  value: boolean,
  extra: { description?: string } = {},
): BooleanParam => ({ type: "boolean", id, label, default: value, ...extra });

export const choice = (
  id: string,
  label: string,
  value: string,
  options: readonly (readonly [string, string])[],
  extra: { description?: string } = {},
): EnumParam => ({
  type: "enum",
  id,
  label,
  default: value,
  options: options.map(([v, l]) => ({ value: v, label: l })),
  ...extra,
});

export const color = (
  id: string,
  label: string,
  value: Color,
  extra: { description?: string } = {},
): ColorParam => ({ type: "color", id, label, default: value, ...extra });

/** A position as fractions of the layer (0..1), e.g. a centre. */
export const point = (
  id: string,
  label: string,
  value: Vec2,
  extra: { description?: string; min?: number; max?: number } = {},
): PointParam => ({
  type: "vec2",
  id,
  label,
  default: value,
  min: extra.min ?? 0,
  max: extra.max ?? 1,
  step: 0.01,
  unit: "%",
  display: 100,
  ...(extra.description === undefined ? {} : { description: extra.description }),
});

export const rgb = (hex: string, a = 1): Color => {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a };
};
