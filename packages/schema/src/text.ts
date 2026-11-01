import * as z from "zod";
import { Color, Id, Vec2 } from "./primitives.ts";
import { named } from "./registry.ts";

export const TextRun = named(
  "TextRun",
  z.strictObject({
    text: z.string(),
    fontFamily: z.string().min(1),
    fontWeight: z.int().min(100).max(900),
    fontSize: z.number().positive(),
    color: Color,
    italic: z.boolean(),
    underline: z.boolean(),
  }),
);
export type TextRun = z.infer<typeof TextRun>;

export const TextStroke = named(
  "TextStroke",
  z.strictObject({ color: Color, width: z.number().min(0) }),
);
export type TextStroke = z.infer<typeof TextStroke>;

export const TextShadow = named(
  "TextShadow",
  z.strictObject({
    color: Color,
    offset: Vec2,
    blur: z.number().min(0),
  }),
);
export type TextShadow = z.infer<typeof TextShadow>;

export const TextBackground = named(
  "TextBackground",
  z.strictObject({
    color: Color,
    padding: z.number().min(0),
    cornerRadius: z.number().min(0),
  }),
);
export type TextBackground = z.infer<typeof TextBackground>;

export const TextBox = named(
  "TextBox",
  z.strictObject({ width: z.number().positive(), height: z.number().positive() }),
  "Paragraph box; text wraps inside it. Absent = point text.",
);
export type TextBox = z.infer<typeof TextBox>;

export const RangeShape = named(
  "RangeShape",
  z.enum(["square", "rampUp", "rampDown", "triangle", "round", "smooth"]),
);
export type RangeShape = z.infer<typeof RangeShape>;

export const TextAnimatorRange = named(
  "TextAnimatorRange",
  z.strictObject({
    start: z.number().min(0).max(1),
    end: z.number().min(0).max(1),
    offset: z.number(),
    shape: RangeShape,
  }),
  "AE-style range selector; start/end/offset are fractions of the unit count.",
);
export type TextAnimatorRange = z.infer<typeof TextAnimatorRange>;

export const TextAnimatorProps = named(
  "TextAnimatorProps",
  z.strictObject({
    opacity: z.number().min(0).max(1).optional(),
    position: Vec2.optional(),
    scale: Vec2.optional(),
    rotation: z.number().optional(),
    blur: z.number().min(0).optional(),
    tracking: z.number().optional(),
    fillColor: Color.optional(),
  }),
);
export type TextAnimatorProps = z.infer<typeof TextAnimatorProps>;

export const TextAnimator = named(
  "TextAnimator",
  z.strictObject({
    id: Id,
    unit: z.enum(["char", "word", "line"]),
    range: TextAnimatorRange,
    props: TextAnimatorProps,
  }),
);
export type TextAnimator = z.infer<typeof TextAnimator>;

export const TextAlign = named("TextAlign", z.enum(["left", "center", "right", "justify"]));
export type TextAlign = z.infer<typeof TextAlign>;

export const TextData = named(
  "TextData",
  z.strictObject({
    runs: z.array(TextRun).min(1),
    align: TextAlign,
    lineHeight: z.number().positive(),
    tracking: z.number(),
    stroke: TextStroke.optional(),
    shadow: TextShadow.optional(),
    background: TextBackground.optional(),
    box: TextBox.optional(),
    animators: z.array(TextAnimator),
  }),
  "Styled text; lineHeight is a multiple of font size, tracking is in 1/1000 em.",
);
export type TextData = z.infer<typeof TextData>;
