import {
  BlendMode,
  type Asset,
  type Clip,
  type ClipPatch,
  type ClipUnsettable,
  type Track,
} from "@lumacut/schema";

export type SectionId = "transform" | "blend" | "crop" | "time" | "audio";

export const SECTIONS: readonly { id: SectionId; title: string }[] = [
  { id: "transform", title: "Transform" },
  { id: "blend", title: "Opacity & blend" },
  { id: "crop", title: "Crop" },
  { id: "time", title: "Time" },
  { id: "audio", title: "Audio" },
];

export type FieldValue = number | string | boolean;

/** What changing a field does to a clip: properties to set, and optional ones to remove. */
export interface FieldPatch {
  props: ClipPatch;
  unset?: ClipUnsettable[];
}

/** The things a field needs to know about a clip to decide whether it applies. */
export interface ClipInfo {
  clip: Clip;
  track: Track | undefined;
  asset: Asset | undefined;
}

export interface FieldDef {
  id: string;
  label: string;
  section: SectionId;
  /** Hidden until the section's "Advanced" switch is on (or a search matches it). */
  advanced?: boolean;
  /** Extra words the inspector's search matches. */
  keywords: readonly string[];
  kind: "number" | "enum" | "boolean";
  /** Shown after the value, e.g. "%", "°". */
  unit?: string;
  /** Scrub and arrow-key step, in display units. */
  step?: number;
  /** Limits in display units. */
  min?: number;
  max?: number;
  options?: readonly string[];
  readOnly?: boolean;
  /** Stored value → what is shown (e.g. 0.5 → 50). Identity when absent. */
  toDisplay?: (stored: number) => number;
  /** What was typed → stored value. */
  fromDisplay?: (shown: number) => number;
  appliesTo: (info: ClipInfo) => boolean;
  get: (clip: Clip) => FieldValue;
  /** The patch that sets this field to a stored value (numbers are already converted from display). */
  set: (clip: Clip, value: FieldValue) => FieldPatch;
}

const isMedia = ({ clip }: ClipInfo): boolean => clip.type === "media";
const onPicture = ({ track }: ClipInfo): boolean => track?.kind !== "audio";
const onAudio = ({ track, clip }: ClipInfo): boolean =>
  track?.kind === "audio" && clip.type === "media";

const percent = {
  unit: "%",
  toDisplay: (v: number) => v * 100,
  fromDisplay: (v: number) => v / 100,
};
const seconds = {
  unit: "s",
  toDisplay: (v: number) => v / 1_000_000,
  fromDisplay: (v: number) => Math.round(v * 1_000_000),
};

const DEFAULT_AUDIO = { volume: 1, pan: 0, fadeInUs: 0, fadeOutUs: 0, effects: [] };
const audioOf = (clip: Clip) => clip.audio ?? DEFAULT_AUDIO;

/** Linear gain ↔ decibels, with silence at the bottom of the range. */
export const MIN_DB = -60;
const dbOf = (gain: number): number =>
  gain <= 0 ? MIN_DB : Math.max(MIN_DB, 20 * Math.log10(gain));
const gainOf = (db: number): number => (db <= MIN_DB ? 0 : 10 ** (db / 20));

function transformField(
  id: string,
  label: string,
  key: "x" | "y" | "rotation" | "anchorX" | "anchorY" | "skew",
  extra: Partial<FieldDef> & { keywords: readonly string[] },
): FieldDef {
  return {
    id,
    label,
    section: "transform",
    kind: "number",
    appliesTo: onPicture,
    get: (clip) => clip.transform[key],
    set: (clip, value) => ({ props: { transform: { ...clip.transform, [key]: Number(value) } } }),
    ...extra,
  };
}

function cropField(id: string, label: string, edge: "left" | "top" | "right" | "bottom"): FieldDef {
  return {
    id,
    label,
    section: "crop",
    kind: "number",
    keywords: ["trim edge", "cut off", edge],
    step: 1,
    min: 0,
    max: 95,
    ...percent,
    appliesTo: onPicture,
    get: (clip) => clip.crop[edge],
    set: (clip, value) => ({ props: { crop: { ...clip.crop, [edge]: Number(value) } } }),
  };
}

export const FIELDS: readonly FieldDef[] = [
  transformField("positionX", "Position X", "x", {
    keywords: ["move", "horizontal", "left right"],
    unit: "px",
    step: 1,
  }),
  transformField("positionY", "Position Y", "y", {
    keywords: ["move", "vertical", "up down"],
    unit: "px",
    step: 1,
  }),
  {
    id: "scale",
    label: "Scale",
    section: "transform",
    kind: "number",
    keywords: ["size", "zoom", "bigger", "smaller", "resize"],
    unit: "%",
    step: 1,
    min: 1,
    max: 1000,
    toDisplay: (v) => v * 100,
    fromDisplay: (v) => v / 100,
    appliesTo: onPicture,
    get: (clip) => clip.transform.scaleX,
    set: (clip, value) => ({
      props: { transform: { ...clip.transform, scaleX: Number(value), scaleY: Number(value) } },
    }),
  },
  {
    id: "scaleX",
    label: "Scale X",
    section: "transform",
    advanced: true,
    kind: "number",
    keywords: ["width", "stretch", "horizontal size"],
    unit: "%",
    step: 1,
    min: 1,
    max: 1000,
    toDisplay: (v) => v * 100,
    fromDisplay: (v) => v / 100,
    appliesTo: onPicture,
    get: (clip) => clip.transform.scaleX,
    set: (clip, value) => ({ props: { transform: { ...clip.transform, scaleX: Number(value) } } }),
  },
  {
    id: "scaleY",
    label: "Scale Y",
    section: "transform",
    advanced: true,
    kind: "number",
    keywords: ["height", "stretch", "vertical size"],
    unit: "%",
    step: 1,
    min: 1,
    max: 1000,
    toDisplay: (v) => v * 100,
    fromDisplay: (v) => v / 100,
    appliesTo: onPicture,
    get: (clip) => clip.transform.scaleY,
    set: (clip, value) => ({ props: { transform: { ...clip.transform, scaleY: Number(value) } } }),
  },
  transformField("rotation", "Rotation", "rotation", {
    keywords: ["turn", "spin", "angle", "degrees"],
    unit: "°",
    step: 1,
  }),
  transformField("anchorX", "Anchor X", "anchorX", {
    advanced: true,
    keywords: ["pivot", "origin", "centre point"],
    unit: "px",
    step: 1,
  }),
  transformField("anchorY", "Anchor Y", "anchorY", {
    advanced: true,
    keywords: ["pivot", "origin", "centre point"],
    unit: "px",
    step: 1,
  }),
  transformField("skew", "Skew", "skew", {
    advanced: true,
    keywords: ["slant", "shear", "italic"],
    unit: "°",
    step: 1,
  }),

  {
    id: "opacity",
    label: "Opacity",
    section: "blend",
    kind: "number",
    keywords: ["transparency", "fade", "see through", "alpha"],
    step: 1,
    min: 0,
    max: 100,
    ...percent,
    appliesTo: onPicture,
    get: (clip) => clip.opacity,
    set: (_clip, value) => ({ props: { opacity: Number(value) } }),
  },
  {
    id: "blendMode",
    label: "Blend mode",
    section: "blend",
    kind: "enum",
    keywords: ["multiply", "screen", "overlay", "composite", "mix"],
    options: BlendMode.options,
    appliesTo: onPicture,
    get: (clip) => clip.blendMode,
    set: (_clip, value) => ({ props: { blendMode: BlendMode.parse(value) } }),
  },

  cropField("cropLeft", "Crop left", "left"),
  cropField("cropTop", "Crop top", "top"),
  cropField("cropRight", "Crop right", "right"),
  cropField("cropBottom", "Crop bottom", "bottom"),

  {
    id: "speed",
    label: "Speed",
    section: "time",
    kind: "number",
    keywords: ["slow motion", "fast", "faster", "slower", "rate"],
    unit: "×",
    step: 0.05,
    min: 0.1,
    max: 16,
    appliesTo: isMedia,
    get: (clip) => clip.speed,
    set: (_clip, value) => ({ props: { speed: Number(value) } }),
  },
  {
    id: "reversed",
    label: "Reverse",
    section: "time",
    kind: "boolean",
    keywords: ["backwards", "rewind", "flip time"],
    appliesTo: isMedia,
    get: (clip) => clip.reversed,
    set: (_clip, value) => ({ props: { reversed: value === true } }),
  },
  {
    id: "freeze",
    label: "Freeze frame",
    section: "time",
    advanced: true,
    kind: "boolean",
    keywords: ["still", "hold", "pause picture", "stop frame"],
    appliesTo: isMedia,
    get: (clip) => clip.freezeAtUs !== undefined,
    // Freezing holds the first frame of the visible part; unfreezing removes the field.
    set: (clip, value) =>
      value === true ? { props: { freezeAtUs: clip.inUs } } : { props: {}, unset: ["freezeAtUs"] },
  },
  {
    id: "sourceIn",
    label: "Source in",
    section: "time",
    advanced: true,
    kind: "number",
    readOnly: true,
    keywords: ["start point", "in point"],
    ...seconds,
    appliesTo: isMedia,
    get: (clip) => clip.inUs,
    set: () => ({ props: {} }),
  },
  {
    id: "sourceOut",
    label: "Source out",
    section: "time",
    advanced: true,
    kind: "number",
    readOnly: true,
    keywords: ["end point", "out point"],
    ...seconds,
    appliesTo: isMedia,
    get: (clip) => clip.outUs,
    set: () => ({ props: {} }),
  },
  {
    id: "duration",
    label: "Duration",
    section: "time",
    kind: "number",
    readOnly: true,
    keywords: ["length", "how long"],
    ...seconds,
    appliesTo: () => true,
    get: (clip) => (clip.outUs - clip.inUs) / clip.speed,
    set: () => ({ props: {} }),
  },

  {
    id: "volume",
    label: "Volume",
    section: "audio",
    kind: "number",
    keywords: ["loudness", "gain", "louder", "quieter", "level", "db"],
    unit: "dB",
    step: 0.5,
    min: MIN_DB,
    max: 12,
    toDisplay: dbOf,
    fromDisplay: gainOf,
    appliesTo: onAudio,
    get: (clip) => audioOf(clip).volume,
    set: (clip, value) => ({ props: { audio: { ...audioOf(clip), volume: Number(value) } } }),
  },
  {
    id: "pan",
    label: "Pan",
    section: "audio",
    kind: "number",
    keywords: ["balance", "left right", "stereo"],
    step: 1,
    min: -100,
    max: 100,
    ...percent,
    appliesTo: onAudio,
    get: (clip) => audioOf(clip).pan,
    set: (clip, value) => ({ props: { audio: { ...audioOf(clip), pan: Number(value) } } }),
  },
  {
    id: "fadeIn",
    label: "Fade in",
    section: "audio",
    advanced: true,
    kind: "number",
    keywords: ["ramp up", "start gently"],
    step: 0.1,
    min: 0,
    ...seconds,
    appliesTo: onAudio,
    get: (clip) => audioOf(clip).fadeInUs,
    set: (clip, value) => ({ props: { audio: { ...audioOf(clip), fadeInUs: Number(value) } } }),
  },
  {
    id: "fadeOut",
    label: "Fade out",
    section: "audio",
    advanced: true,
    kind: "number",
    keywords: ["ramp down", "end gently"],
    step: 0.1,
    min: 0,
    ...seconds,
    appliesTo: onAudio,
    get: (clip) => audioOf(clip).fadeOutUs,
    set: (clip, value) => ({ props: { audio: { ...audioOf(clip), fadeOutUs: Number(value) } } }),
  },
];

export function fieldById(id: string): FieldDef {
  const field = FIELDS.find((f) => f.id === id);
  if (field === undefined) throw new Error(`Unknown inspector field "${id}"`);
  return field;
}
