import * as z from "zod";
import { Rgb, Vec2 } from "./primitives.ts";
import { named } from "./registry.ts";

export const CurvePoints = named(
  "CurvePoints",
  z.array(Vec2).min(2),
  "Curve control points [x, y] in [0, 1], interpolated with a monotone cubic.",
);
export type CurvePoints = z.infer<typeof CurvePoints>;

export const Curves = named(
  "Curves",
  z.strictObject({
    master: CurvePoints,
    r: CurvePoints,
    g: CurvePoints,
    b: CurvePoints,
    hueVsSat: CurvePoints.optional(),
    hueVsHue: CurvePoints.optional(),
    lumVsSat: CurvePoints.optional(),
  }),
);
export type Curves = z.infer<typeof Curves>;

export const HslBand = named(
  "HslBand",
  z.strictObject({
    hue: z.number(),
    saturation: z.number(),
    luminance: z.number(),
  }),
  "Adjustment for one hue range; all values neutral at 0.",
);
export type HslBand = z.infer<typeof HslBand>;

export const HslAdjustments = named(
  "HslAdjustments",
  z.strictObject({
    red: HslBand,
    orange: HslBand,
    yellow: HslBand,
    green: HslBand,
    aqua: HslBand,
    blue: HslBand,
    purple: HslBand,
    magenta: HslBand,
  }),
  "Per-color-range HSL adjustments over 8 fixed hue bands.",
);
export type HslAdjustments = z.infer<typeof HslAdjustments>;

/** A `lut` asset's id, or one of the engine's built-in looks (`builtin:teal-orange`). */
export const LutId = named(
  "LutId",
  z.string().regex(/^(?:[A-Za-z0-9_-]{1,64}|builtin:[a-z0-9-]{1,48})$/),
  "A `lut` asset id ([A-Za-z0-9_-], 1-64 chars), or a built-in look: `builtin:` + a lowercase slug.",
);
export type LutId = z.infer<typeof LutId>;

export const LutRef = named(
  "LutRef",
  z.strictObject({
    lutId: LutId,
    intensity: z.number().min(0).max(1),
  }),
  "3D LUT applied at the end of the grade; lutId is a `lut` asset or a built-in look.",
);
export type LutRef = z.infer<typeof LutRef>;

export const ColorSettings = named(
  "ColorSettings",
  z.strictObject({
    exposure: z.number(),
    contrast: z.number(),
    highlights: z.number(),
    shadows: z.number(),
    whites: z.number(),
    blacks: z.number(),
    temperature: z.number(),
    tint: z.number(),
    saturation: z.number(),
    vibrance: z.number(),
    lift: Rgb,
    gamma: Rgb,
    gain: Rgb,
    offset: Rgb,
    curves: Curves.optional(),
    hsl: HslAdjustments.optional(),
    lut: LutRef.optional(),
  }),
  "Primary grade. Every scalar and every [r,g,b] wheel is neutral at 0.",
);
export type ColorSettings = z.infer<typeof ColorSettings>;
