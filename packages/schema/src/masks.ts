import * as z from "zod";
import { BezierPath, Id } from "./primitives.ts";
import { named } from "./registry.ts";

export const MaskMode = named("MaskMode", z.enum(["add", "subtract", "intersect"]));
export type MaskMode = z.infer<typeof MaskMode>;

const maskCommon = {
  id: Id,
  mode: MaskMode,
  feather: z.number().min(0),
  expansion: z.number(),
  opacity: z.number().min(0).max(1),
  inverted: z.boolean(),
};

export const PathMask = named(
  "PathMask",
  z.strictObject({
    kind: z.literal("path"),
    ...maskCommon,
    path: BezierPath,
  }),
  "Vector mask drawn with the pen; its path is keyframeable.",
);
export type PathMask = z.infer<typeof PathMask>;

export const RasterMask = named(
  "RasterMask",
  z.strictObject({
    kind: z.literal("raster"),
    ...maskCommon,
    assetId: Id,
  }),
  "Bitmap mask (mask brush, AI subject select) stored as an image asset.",
);
export type RasterMask = z.infer<typeof RasterMask>;

export const Mask = named("Mask", z.discriminatedUnion("kind", [PathMask, RasterMask]));
export type Mask = z.infer<typeof Mask>;
