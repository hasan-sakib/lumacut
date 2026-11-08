import type { Clip, Keyframe, KeyframeValue, Op, TextAnimator, Vec2 } from "@lumacut/schema";
import { evaluate } from "../keyframes/evaluate.ts";
import { applyEasePreset, keyframeOps } from "../keyframes/presets.ts";
import { lengthOf } from "../model.ts";

/** What a motion preset needs to know about where it lands. */
export interface PresetContext {
  /** Composition size in pixels (slides move by a fraction of it). */
  width: number;
  height: number;
  /** Where the preset begins, µs from the clip's start. */
  startUs: number;
  /** How long it lasts. */
  durationUs: number;
  /** 1 = the preset's own strength; 0.5 half, 2 double. */
  intensity: number;
  /** Fresh ids (text animators). */
  newId: () => string;
}

export type PresetCategory = "In" | "Out" | "Emphasis" | "Text";

/** Where a preset sits by default: In at the clip's start, Out at its end, Emphasis at the playhead. */
export const DEFAULT_ANCHOR: Record<PresetCategory, "start" | "end" | "playhead"> = {
  In: "start",
  Out: "end",
  Emphasis: "playhead",
  Text: "start",
};

export interface MotionPreset {
  id: string;
  name: string;
  description: string;
  category: PresetCategory;
  keywords: readonly string[];
  /** Length used when none is asked for. */
  defaultDurationUs: number;
  appliesTo: (clip: Clip) => boolean;
  ops: (clip: Clip, context: PresetContext) => Op[];
}

const hasText = (clip: Clip): boolean =>
  (clip.type === "text" || clip.type === "caption") && clip.text !== undefined;
const isPicture = (clip: Clip): boolean => clip.type !== "adjustment";

/** A deterministic random sequence (mulberry32): the same clip and seed always shake the same way. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

const key = (
  tUs: number,
  value: KeyframeValue,
  interpolation: Keyframe["interpolation"] = "bezier",
  extra: Partial<Keyframe> = {},
): Keyframe => ({ tUs: Math.round(tUs), value, interpolation, ...extra });

const EASE_OUT = { influence: 70, speed: 0 };
const EASE_IN = { influence: 70, speed: 0 };
const outKey = (t: number, v: KeyframeValue): Keyframe =>
  key(t, v, "bezier", { easeOut: EASE_OUT });
const inKey = (t: number, v: KeyframeValue): Keyframe => key(t, v, "bezier", { easeIn: EASE_IN });

/**
 * The ops that make `path` follow `frames`: keyframes of the preset replace whatever the property
 * had inside the preset's time window, and keyframes outside it stay. Only whole-property sets, so
 * applying a preset twice gives the same result as applying it once.
 */
export function setFrames(clip: Clip, path: string, frames: readonly Keyframe[]): Op[] {
  const sorted = [...frames].sort((a, b) => a.tUs - b.tUs);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first === undefined || last === undefined) return [];
  const before = clip.keyframes[path] ?? [];
  const kept = before.filter((k) => k.tUs < first.tUs || k.tUs > last.tUs);
  const after = [...kept, ...sorted].sort((a, b) => a.tUs - b.tUs);
  return keyframeOps(clip.id, path, before, after);
}

const valueAt = (clip: Clip, path: string, tUs: number, fallback: KeyframeValue): KeyframeValue =>
  evaluate(clip, path, tUs) ?? fallback;

const num = (v: KeyframeValue, fallback: number): number => (typeof v === "number" ? v : fallback);
const vec = (v: KeyframeValue, fallback: Vec2): Vec2 =>
  Array.isArray(v) ? [v[0], v[1]] : fallback;

/** Opacity from `from` to `to` over the window. */
function opacityOps(clip: Clip, c: PresetContext, from: number, to: number, share = 1): Op[] {
  const end = c.startUs + c.durationUs * share;
  return setFrames(clip, "opacity", [
    key(c.startUs, from, "bezier", { easeOut: EASE_OUT }),
    key(end, to, "bezier", { easeIn: EASE_IN }),
  ]);
}

function slide(direction: "left" | "right" | "up" | "down"): [number, number] {
  return direction === "left"
    ? [-1, 0]
    : direction === "right"
      ? [1, 0]
      : direction === "up"
        ? [0, -1]
        : [0, 1];
}

function slideOps(
  clip: Clip,
  c: PresetContext,
  direction: "left" | "right" | "up" | "down",
  entering: boolean,
): Op[] {
  const [dx, dy] = slide(direction);
  const distance = (dx === 0 ? c.height : c.width) * 0.25 * c.intensity;
  const end = c.startUs + c.durationUs;
  const rest = vec(
    valueAt(clip, "transform.position", entering ? end : c.startUs, [
      clip.transform.x,
      clip.transform.y,
    ]),
    [clip.transform.x, clip.transform.y],
  );
  const away: Vec2 = [rest[0] + dx * distance, rest[1] + dy * distance];
  const frames = entering
    ? [outKey(c.startUs, away), inKey(end, rest)]
    : [outKey(c.startUs, rest), inKey(end, away)];
  return [
    ...setFrames(clip, "transform.position", frames),
    ...opacityOps(clip, c, entering ? 0 : 1, entering ? 1 : 0, 0.6),
  ];
}

function slidePreset(direction: "left" | "right" | "up" | "down", entering: boolean): MotionPreset {
  const from =
    direction === "left"
      ? "left"
      : direction === "right"
        ? "right"
        : direction === "up"
          ? "above"
          : "below";
  return {
    id: `slide${entering ? "In" : "Out"}${direction[0]?.toUpperCase() ?? ""}${direction.slice(1)}`,
    name: entering ? `Slide in from ${from}` : `Slide out to ${from}`,
    description: entering
      ? `Slides in from ${from} while fading in.`
      : `Slides away to ${from} while fading out.`,
    category: entering ? "In" : "Out",
    keywords: ["slide", "move", entering ? "in" : "out", from, "enter", "exit"],
    defaultDurationUs: 600_000,
    appliesTo: isPicture,
    ops: (clip, c) => slideOps(clip, c, entering ? direction : direction, entering),
  };
}

const scaleOf = (clip: Clip, atUs: number): Vec2 =>
  vec(valueAt(clip, "transform.scale", atUs, [clip.transform.scaleX, clip.transform.scaleY]), [
    clip.transform.scaleX,
    clip.transform.scaleY,
  ]);

const times = (v: Vec2, k: number): Vec2 => [v[0] * k, v[1] * k];

export const MOTION_PRESETS: readonly MotionPreset[] = [
  {
    id: "fadeIn",
    name: "Fade in",
    description: "Fades the clip in.",
    category: "In",
    keywords: ["fade", "in", "appear", "opacity"],
    defaultDurationUs: 500_000,
    appliesTo: isPicture,
    ops: (clip, c) =>
      opacityOps(
        clip,
        c,
        0,
        num(valueAt(clip, "opacity", c.startUs + c.durationUs, clip.opacity), 1) || 1,
      ),
  },
  {
    id: "fadeOut",
    name: "Fade out",
    description: "Fades the clip out.",
    category: "Out",
    keywords: ["fade", "out", "disappear", "opacity"],
    defaultDurationUs: 500_000,
    appliesTo: isPicture,
    ops: (clip, c) =>
      opacityOps(clip, c, num(valueAt(clip, "opacity", c.startUs, clip.opacity), 1), 0),
  },
  slidePreset("left", true),
  slidePreset("right", true),
  slidePreset("up", true),
  slidePreset("down", true),
  slidePreset("left", false),
  slidePreset("right", false),
  {
    id: "pop",
    name: "Pop",
    description: "Pops in from nothing, overshoots a little and settles.",
    category: "In",
    keywords: ["pop", "scale", "appear", "overshoot", "in"],
    defaultDurationUs: 500_000,
    appliesTo: isPicture,
    ops: (clip, c) => {
      const end = c.startUs + c.durationUs;
      const rest = scaleOf(clip, end);
      const over = 1 + 0.15 * c.intensity;
      return [
        ...setFrames(clip, "transform.scale", [
          outKey(c.startUs, [0, 0]),
          key(c.startUs + c.durationUs * 0.65, times(rest, over), "bezier", {
            easeIn: EASE_IN,
            easeOut: EASE_OUT,
          }),
          inKey(end, rest),
        ]),
        ...opacityOps(clip, c, 0, 1, 0.3),
      ];
    },
  },
  {
    id: "bounceIn",
    name: "Bounce in",
    description: "Drops in at full size and bounces to rest.",
    category: "In",
    keywords: ["bounce", "drop", "spring", "in"],
    defaultDurationUs: 900_000,
    appliesTo: isPicture,
    ops: (clip, c) => {
      const end = c.startUs + c.durationUs;
      const rest = scaleOf(clip, end);
      const frames = applyEasePreset(
        [key(c.startUs, [0, 0], "bezier"), key(end, rest, "bezier")],
        0,
        "bounce",
      );
      return [...setFrames(clip, "transform.scale", frames), ...opacityOps(clip, c, 0, 1, 0.2)];
    },
  },
  {
    id: "zoomPunch",
    name: "Zoom punch",
    description: "A quick push in and back out for emphasis.",
    category: "Emphasis",
    keywords: ["zoom", "punch", "push", "emphasis", "beat", "hit"],
    defaultDurationUs: 300_000,
    appliesTo: isPicture,
    ops: (clip, c) => {
      const base = scaleOf(clip, c.startUs);
      const peak = times(base, 1 + 0.3 * c.intensity);
      return setFrames(clip, "transform.scale", [
        outKey(c.startUs, base),
        key(c.startUs + c.durationUs * 0.4, peak, "bezier", { easeIn: EASE_IN, easeOut: EASE_OUT }),
        inKey(c.startUs + c.durationUs, base),
      ]);
    },
  },
  {
    id: "shake",
    name: "Shake",
    description: "A camera-shake jitter that settles down.",
    category: "Emphasis",
    keywords: ["shake", "jitter", "camera", "earthquake", "rumble", "impact"],
    defaultDurationUs: 500_000,
    appliesTo: isPicture,
    ops: (clip, c) => {
      const rand = seeded(hashString(clip.id) ^ Math.round(c.startUs));
      const base = vec(
        valueAt(clip, "transform.position", c.startUs, [clip.transform.x, clip.transform.y]),
        [clip.transform.x, clip.transform.y],
      );
      const steps = Math.max(4, Math.round(c.durationUs / 45_000));
      const amplitude = 24 * c.intensity;
      const frames: Keyframe[] = [];
      for (let i = 0; i <= steps; i += 1) {
        const decay = 1 - i / steps;
        const last = i === steps;
        const offset: Vec2 = last
          ? [0, 0]
          : [(rand() - 0.5) * 2 * amplitude * decay, (rand() - 0.5) * 2 * amplitude * decay];
        frames.push(
          key(
            c.startUs + (c.durationUs * i) / steps,
            [base[0] + offset[0], base[1] + offset[1]],
            "linear",
          ),
        );
      }
      return setFrames(clip, "transform.position", frames);
    },
  },
  {
    id: "glitch",
    name: "Glitch",
    description: "Sudden jumps and flickers, like a corrupted signal.",
    category: "Emphasis",
    keywords: ["glitch", "flicker", "digital", "corrupt", "jump", "signal"],
    defaultDurationUs: 400_000,
    appliesTo: isPicture,
    ops: (clip, c) => {
      const rand = seeded(hashString(clip.id) ^ (Math.round(c.startUs) + 7));
      const base = vec(
        valueAt(clip, "transform.position", c.startUs, [clip.transform.x, clip.transform.y]),
        [clip.transform.x, clip.transform.y],
      );
      const baseOpacity = num(valueAt(clip, "opacity", c.startUs, clip.opacity), 1);
      const steps = Math.max(4, Math.round(c.durationUs / 50_000));
      const position: Keyframe[] = [];
      const opacity: Keyframe[] = [];
      for (let i = 0; i <= steps; i += 1) {
        const t = c.startUs + (c.durationUs * i) / steps;
        const last = i === steps;
        const jump = last || rand() < 0.35 ? 0 : (rand() - 0.5) * 2 * c.width * 0.04 * c.intensity;
        position.push(key(t, [base[0] + jump, base[1]], "hold"));
        opacity.push(key(t, last || rand() > 0.3 ? baseOpacity : baseOpacity * 0.55, "hold"));
      }
      return [
        ...setFrames(clip, "transform.position", position),
        ...setFrames(clip, "opacity", opacity),
      ];
    },
  },
  {
    id: "textTypewriter",
    name: "Typewriter",
    description: "Types the text out one character at a time.",
    category: "Text",
    keywords: ["typewriter", "type", "text", "letters", "reveal", "characters"],
    defaultDurationUs: 1_500_000,
    appliesTo: hasText,
    ops: (clip, c) => textRevealOps(clip, c, "char", "square", { opacity: 0 }),
  },
  {
    id: "textFadeUp",
    name: "Text rise and fade in",
    description: "Each character floats up and fades in, one after another.",
    category: "Text",
    keywords: ["text", "fade", "rise", "float", "letters", "in", "stagger"],
    defaultDurationUs: 1_200_000,
    appliesTo: hasText,
    ops: (clip, c) =>
      textRevealOps(clip, c, "char", "rampUp", { opacity: 0, position: [0, 30 * c.intensity] }),
  },
  {
    id: "textWordsIn",
    name: "Words pop in",
    description: "Words scale up and fade in one at a time.",
    category: "Text",
    keywords: ["text", "words", "pop", "scale", "in", "stagger"],
    defaultDurationUs: 1_000_000,
    appliesTo: hasText,
    ops: (clip, c) => textRevealOps(clip, c, "word", "rampUp", { opacity: 0, scale: [0.4, 0.4] }),
  },
  {
    id: "textOut",
    name: "Text fade out",
    description: "Each character fades away, right to left.",
    category: "Text",
    keywords: ["text", "fade", "out", "letters", "disappear"],
    defaultDurationUs: 900_000,
    appliesTo: hasText,
    ops: (clip, c) => textRevealOps(clip, c, "char", "rampUp", { opacity: 0 }, true),
  },
];

/**
 * A text animator that hides (or fades/moves/scales) characters, words or lines inside a range,
 * and a keyframed range offset that slides the range away so they appear in turn (or, reversed,
 * disappear in turn).
 */
function textRevealOps(
  clip: Clip,
  c: PresetContext,
  unit: TextAnimator["unit"],
  shape: TextAnimator["range"]["shape"],
  props: TextAnimator["props"],
  leaving = false,
): Op[] {
  if (clip.text === undefined) return [];
  const id = c.newId();
  const animator: TextAnimator = {
    id,
    unit,
    range: { start: 0, end: 1, offset: leaving ? 1 : 0, shape },
    props,
  };
  const path = `text.animators.${id}.range.offset`;
  const end = c.startUs + c.durationUs;
  const frames = leaving
    ? [key(c.startUs, 1, "linear"), key(end, 0, "linear")]
    : [key(c.startUs, 0, "linear"), key(end, 1, "linear")];
  return [
    {
      type: "setProps",
      clipId: clip.id,
      props: { text: { ...clip.text, animators: [...clip.text.animators, animator] } },
    },
    ...frames.map((keyframe): Op => ({ type: "addKeyframe", clipId: clip.id, path, keyframe })),
  ];
}

export const presetById = (id: string): MotionPreset | undefined =>
  MOTION_PRESETS.find((p) => p.id === id);

export interface ApplyPresetOptions {
  width: number;
  height: number;
  /** Clip-local start in µs; defaults by category (start / end of the clip / playhead). */
  startUs?: number;
  /** Where the playhead is, clip-local (used by emphasis presets when no start is given). */
  playheadLocalUs?: number;
  durationUs?: number;
  intensity?: number;
  newId: () => string;
}

/** The ops that apply a preset to a clip (empty when it doesn't fit the clip). All are ordinary keyframes: nothing about them is locked. */
export function presetOps(preset: MotionPreset, clip: Clip, options: ApplyPresetOptions): Op[] {
  if (!preset.appliesTo(clip)) return [];
  const length = lengthOf(clip);
  const duration = Math.max(1, Math.min(options.durationUs ?? preset.defaultDurationUs, length));
  const anchor = DEFAULT_ANCHOR[preset.category];
  const start =
    options.startUs ??
    (anchor === "start"
      ? 0
      : anchor === "end"
        ? length - duration
        : (options.playheadLocalUs ?? 0));
  const startUs = Math.max(0, Math.min(length - duration, Math.round(start)));
  return preset.ops(clip, {
    width: options.width,
    height: options.height,
    startUs,
    durationUs: duration,
    intensity: options.intensity ?? 1,
    newId: options.newId,
  });
}
