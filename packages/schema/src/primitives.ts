import * as z from "zod";
import { named } from "./registry.ts";

/** Stable identifier. No dots, so ids can be used as segments of property paths. */
export const Id = named(
  "Id",
  z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  "Stable identifier: 1-64 chars of [A-Za-z0-9_-].",
);
export type Id = z.infer<typeof Id>;

/** A point in time or a duration, in integer microseconds (never negative). */
export const TimeUs = named(
  "TimeUs",
  z.int().min(0),
  "Non-negative time or duration in integer microseconds.",
);
export type TimeUs = z.infer<typeof TimeUs>;

/** A signed time offset in integer microseconds (e.g. slip/slide deltas). */
export const DeltaUs = named("DeltaUs", z.int(), "Signed time offset in integer microseconds.");
export type DeltaUs = z.infer<typeof DeltaUs>;

/** Exact frame rate as a rational, e.g. 30000/1001 for 29.97 fps. */
export const Rational = named(
  "Rational",
  z.strictObject({
    num: z.int().min(1),
    den: z.int().min(1),
  }),
  "Exact rational number (num/den), used for frame rates such as 30000/1001.",
);
export type Rational = z.infer<typeof Rational>;

export const Vec2 = named("Vec2", z.tuple([z.number(), z.number()]), "2D vector [x, y].");
export type Vec2 = z.infer<typeof Vec2>;

export const Rgb = named(
  "Rgb",
  z.tuple([z.number(), z.number(), z.number()]),
  "Per-channel triple [r, g, b].",
);
export type Rgb = z.infer<typeof Rgb>;

const Unit = z.number().min(0).max(1);

/** sRGB-encoded color with straight alpha; every channel is in [0, 1]. */
export const Color = named(
  "Color",
  z.strictObject({ r: Unit, g: Unit, b: Unit, a: Unit }),
  "sRGB-encoded color with straight alpha, channels in [0, 1].",
);
export type Color = z.infer<typeof Color>;

/** Bezier vertex; tangents are relative to `point` (After Effects convention). */
export const BezierVertex = named(
  "BezierVertex",
  z.strictObject({
    point: Vec2,
    inTangent: Vec2,
    outTangent: Vec2,
  }),
  "Bezier vertex; inTangent/outTangent are offsets relative to point.",
);
export type BezierVertex = z.infer<typeof BezierVertex>;

export const BezierPath = named(
  "BezierPath",
  z.strictObject({
    closed: z.boolean(),
    vertices: z.array(BezierVertex),
  }),
  "Open or closed cubic Bezier path.",
);
export type BezierPath = z.infer<typeof BezierPath>;

/** UTC timestamp in ISO 8601 form, as produced by `Date.prototype.toISOString()`. */
export const IsoUtcDateTime = named(
  "IsoUtcDateTime",
  z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/),
  "UTC timestamp in ISO 8601 form, e.g. 2026-11-01T12:00:00.000Z. Metadata only; never used for rendering.",
);
export type IsoUtcDateTime = z.infer<typeof IsoUtcDateTime>;

/**
 * Dot-separated path to a keyframeable property. Collection items are addressed by stable id,
 * never by index, e.g. `transform.x`, `effects.<effectId>.params.radius`, `masks.<maskId>.path`.
 */
export const PropertyPath = named(
  "PropertyPath",
  z.string().regex(/^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$/),
  "Dot-separated property path; collection items are addressed by id, never by index.",
);
export type PropertyPath = z.infer<typeof PropertyPath>;

export const Origin = named(
  "Origin",
  z.enum(["user", "ai", "template"]),
  "Who created an item: the user, an AI run, or a template.",
);
export type Origin = z.infer<typeof Origin>;
