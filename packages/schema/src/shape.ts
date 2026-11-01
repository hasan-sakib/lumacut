import * as z from "zod";
import { BezierPath, Color, Id, Vec2 } from "./primitives.ts";
import { named } from "./registry.ts";

const NonNegative = z.number().min(0);

export const RectItem = named(
  "RectItem",
  z.strictObject({
    kind: z.literal("rect"),
    id: Id,
    position: Vec2,
    size: Vec2,
    roundness: NonNegative,
  }),
);
export type RectItem = z.infer<typeof RectItem>;

export const EllipseItem = named(
  "EllipseItem",
  z.strictObject({
    kind: z.literal("ellipse"),
    id: Id,
    position: Vec2,
    size: Vec2,
  }),
);
export type EllipseItem = z.infer<typeof EllipseItem>;

export const PolygonItem = named(
  "PolygonItem",
  z.strictObject({
    kind: z.literal("polygon"),
    id: Id,
    position: Vec2,
    points: z.int().min(3),
    radius: NonNegative,
    roundness: NonNegative,
    rotation: z.number(),
  }),
);
export type PolygonItem = z.infer<typeof PolygonItem>;

export const StarItem = named(
  "StarItem",
  z.strictObject({
    kind: z.literal("star"),
    id: Id,
    position: Vec2,
    points: z.int().min(3),
    innerRadius: NonNegative,
    outerRadius: NonNegative,
    innerRoundness: NonNegative,
    outerRoundness: NonNegative,
    rotation: z.number(),
  }),
);
export type StarItem = z.infer<typeof StarItem>;

export const PathItem = named(
  "PathItem",
  z.strictObject({
    kind: z.literal("path"),
    id: Id,
    path: BezierPath,
  }),
);
export type PathItem = z.infer<typeof PathItem>;

export const ShapeItem = named(
  "ShapeItem",
  z.discriminatedUnion("kind", [RectItem, EllipseItem, PolygonItem, StarItem, PathItem]),
);
export type ShapeItem = z.infer<typeof ShapeItem>;

export const ShapeFill = named(
  "ShapeFill",
  z.strictObject({
    color: Color,
    rule: z.enum(["nonzero", "evenodd"]),
  }),
);
export type ShapeFill = z.infer<typeof ShapeFill>;

export const ShapeStroke = named(
  "ShapeStroke",
  z.strictObject({
    color: Color,
    width: NonNegative,
    cap: z.enum(["butt", "round", "square"]),
    join: z.enum(["miter", "round", "bevel"]),
    dash: z.array(NonNegative),
  }),
  "Stroke; dash lists alternating dash/gap lengths in pixels (empty = solid).",
);
export type ShapeStroke = z.infer<typeof ShapeStroke>;

export const TrimPaths = named(
  "TrimPaths",
  z.strictObject({
    start: z.number().min(0).max(1),
    end: z.number().min(0).max(1),
    offset: z.number(),
  }),
  "Trim paths: start/end as fractions of path length, offset in degrees.",
);
export type TrimPaths = z.infer<typeof TrimPaths>;

export const ShapeData = named(
  "ShapeData",
  z.strictObject({
    items: z.array(ShapeItem),
    fill: ShapeFill.optional(),
    stroke: ShapeStroke.optional(),
    trimPaths: TrimPaths.optional(),
    roundCorners: NonNegative.optional(),
  }),
);
export type ShapeData = z.infer<typeof ShapeData>;
