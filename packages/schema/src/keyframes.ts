import * as z from "zod";
import { BezierPath, Color, PropertyPath, TimeUs, Vec2 } from "./primitives.ts";
import { named } from "./registry.ts";

export const KeyframeValue = named(
  "KeyframeValue",
  z.union([z.number(), Vec2, Color, BezierPath]),
  "Value of a keyframeable property: scalar, 2D point, color, or Bezier path (mask shapes).",
);
export type KeyframeValue = z.infer<typeof KeyframeValue>;

export const Interpolation = named("Interpolation", z.enum(["linear", "bezier", "hold"]));
export type Interpolation = z.infer<typeof Interpolation>;

/** After Effects-style temporal ease handle. */
export const Ease = named(
  "Ease",
  z.strictObject({
    influence: z.number().min(0).max(100),
    speed: z.number(),
  }),
  "Temporal ease handle: influence in percent [0, 100], speed in property units per second.",
);
export type Ease = z.infer<typeof Ease>;

export const SpatialTangents = named(
  "SpatialTangents",
  z.strictObject({ in: Vec2, out: Vec2 }),
  "Spatial Bezier tangents for curved motion paths, relative to the keyframe position.",
);
export type SpatialTangents = z.infer<typeof SpatialTangents>;

export const Keyframe = named(
  "Keyframe",
  z.strictObject({
    tUs: TimeUs,
    value: KeyframeValue,
    interpolation: Interpolation,
    easeIn: Ease.optional(),
    easeOut: Ease.optional(),
    spatialTangents: SpatialTangents.optional(),
  }),
  "Keyframe; tUs is relative to the owning clip's startUs, so keyframes move with the clip.",
);
export type Keyframe = z.infer<typeof Keyframe>;

export const KeyframeTracks = named(
  "KeyframeTracks",
  z.record(PropertyPath, z.array(Keyframe)),
  "Keyframes per property path. Any numeric, color, point or path property is keyframeable.",
);
export type KeyframeTracks = z.infer<typeof KeyframeTracks>;
