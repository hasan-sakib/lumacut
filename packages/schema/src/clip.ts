import * as z from "zod";
import { ColorSettings } from "./color.ts";
import { AudioEffectInstance, EffectInstance, TransitionInstance } from "./effects.ts";
import { KeyframeTracks } from "./keyframes.ts";
import { Mask } from "./masks.ts";
import { Color, Id, Origin, TimeUs } from "./primitives.ts";
import { named } from "./registry.ts";
import { ShapeData } from "./shape.ts";
import { TextData } from "./text.ts";

export const ClipType = named(
  "ClipType",
  z.enum(["media", "text", "shape", "solid", "adjustment", "composition", "caption", "paint"]),
);
export type ClipType = z.infer<typeof ClipType>;

export const Transform = named(
  "Transform",
  z.strictObject({
    x: z.number(),
    y: z.number(),
    scaleX: z.number(),
    scaleY: z.number(),
    rotation: z.number(),
    anchorX: z.number(),
    anchorY: z.number(),
    skew: z.number(),
  }),
  "x/y: anchor position in composition pixels (origin top-left). anchorX/Y: in layer pixels. " +
    "scale: 1 = 100%. rotation and skew: degrees, clockwise.",
);
export type Transform = z.infer<typeof Transform>;

const Fraction = z.number().min(0).max(1);

export const Crop = named(
  "Crop",
  z.strictObject({ left: Fraction, top: Fraction, right: Fraction, bottom: Fraction }),
  "Crop from each edge as a fraction of the source size.",
);
export type Crop = z.infer<typeof Crop>;

export const BlendMode = named(
  "BlendMode",
  z.enum([
    "normal",
    "darken",
    "multiply",
    "colorBurn",
    "linearBurn",
    "lighten",
    "screen",
    "colorDodge",
    "add",
    "overlay",
    "softLight",
    "hardLight",
    "vividLight",
    "linearLight",
    "pinLight",
    "hardMix",
    "difference",
    "exclusion",
    "subtract",
    "divide",
    "hue",
    "saturation",
    "color",
    "luminosity",
  ]),
);
export type BlendMode = z.infer<typeof BlendMode>;

export const TrackMatte = named(
  "TrackMatte",
  z.strictObject({
    sourceClipId: Id,
    mode: z.enum(["alpha", "alphaInverted", "luma", "lumaInverted"]),
  }),
);
export type TrackMatte = z.infer<typeof TrackMatte>;

export const ClipAudio = named(
  "ClipAudio",
  z.strictObject({
    volume: z.number().min(0).max(4),
    pan: z.number().min(-1).max(1),
    fadeInUs: TimeUs,
    fadeOutUs: TimeUs,
    effects: z.array(AudioEffectInstance),
  }),
  "volume is a linear gain (1 = unity, 4 = +12 dB); pan is -1 (left) to 1 (right).",
);
export type ClipAudio = z.infer<typeof ClipAudio>;

export const MotionBlur = named(
  "MotionBlur",
  z.strictObject({
    enabled: z.boolean(),
    shutterAngle: z.number().min(0).max(720),
    samples: z.int().min(1).max(64),
  }),
);
export type MotionBlur = z.infer<typeof MotionBlur>;

export const CaptionWord = named(
  "CaptionWord",
  z.strictObject({
    text: z.string(),
    startUs: TimeUs,
    endUs: TimeUs,
  }),
  "One word of a caption; times are relative to the caption clip's startUs.",
);
export type CaptionWord = z.infer<typeof CaptionWord>;

export const CaptionData = named(
  "CaptionData",
  z.strictObject({
    words: z.array(CaptionWord),
    styleId: z.string().min(1).optional(),
    highlightColor: Color.optional(),
    maxLines: z.int().min(1).max(6).optional(),
    maxCharsPerLine: z.int().min(4).max(120).optional(),
  }),
  "Word timing for caption clips (karaoke highlighting, re-timing). Styling lives in `text`. " +
    "highlightColor colors the word being spoken (none = no highlight); maxLines and " +
    "maxCharsPerLine control how words are grouped into on-screen lines.",
);
export type CaptionData = z.infer<typeof CaptionData>;

export const SolidData = named(
  "SolidData",
  z.strictObject({ color: Color }),
  "Content of a solid clip: a flat color filling the composition.",
);
export type SolidData = z.infer<typeof SolidData>;

export const PaintStroke = named(
  "PaintStroke",
  z.strictObject({
    id: Id,
    tool: z.enum(["brush", "eraser"]),
    color: Color,
    size: z.number().positive(),
    hardness: Fraction,
    opacity: Fraction,
    points: z.array(z.number()),
  }),
  "Vector paint stroke. points is a flat list of (x, y, pressure) triples in layer pixels.",
);
export type PaintStroke = z.infer<typeof PaintStroke>;

export const PaintData = named(
  "PaintData",
  z.strictObject({ strokes: z.array(PaintStroke) }),
  "Paint layer content, stored inline; the raster cache is local and never persisted.",
);
export type PaintData = z.infer<typeof PaintData>;

export const PlaceholderInfo = named(
  "PlaceholderInfo",
  z.strictObject({
    slotId: z.string().min(1),
    kind: z.enum(["media", "text", "color"]),
    label: z.string(),
  }),
  "Marks a clip as a replaceable template slot.",
);
export type PlaceholderInfo = z.infer<typeof PlaceholderInfo>;

export const Clip = named(
  "Clip",
  z.strictObject({
    id: Id,
    type: ClipType,
    assetId: Id.optional(),
    compositionId: Id.optional(),
    startUs: TimeUs,
    inUs: TimeUs,
    outUs: TimeUs,
    speed: z.number().positive(),
    reversed: z.boolean(),
    freezeAtUs: TimeUs.optional(),
    transform: Transform,
    opacity: Fraction,
    blendMode: BlendMode,
    crop: Crop,
    masks: z.array(Mask),
    trackMatte: TrackMatte.optional(),
    color: ColorSettings,
    effects: z.array(EffectInstance),
    audio: ClipAudio.optional(),
    text: TextData.optional(),
    shape: ShapeData.optional(),
    solid: SolidData.optional(),
    paint: PaintData.optional(),
    caption: CaptionData.optional(),
    motionBlur: MotionBlur,
    keyframes: KeyframeTracks,
    transitionIn: TransitionInstance.optional(),
    linkId: Id.optional(),
    source: Origin,
    aiRunId: Id.optional(),
    placeholder: PlaceholderInfo.optional(),
  }),
  "An item on a track. Timeline length is clipTimelineDurationUs(inUs, outUs, speed). " +
    "freezeAtUs (source time) turns a media clip into a freeze frame.",
);
export type Clip = z.infer<typeof Clip>;
