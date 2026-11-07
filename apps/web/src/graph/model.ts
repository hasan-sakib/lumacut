import { evaluateFrames, segmentInfo, speedProfile, type ValueKind, kindOf } from "@lumacut/ops";
import type { Clip, Ease, Keyframe, KeyframeValue } from "@lumacut/schema";
import { FIELDS } from "../inspector/fields.ts";

/** Which curve the editor draws: the property's value over time, or how fast it changes. */
export type GraphMode = "value" | "speed";

export interface PropertyCurve {
  path: string;
  label: string;
  kind: ValueKind;
  frames: Keyframe[];
}

/** A human name for a property path ("transform.position" → "Position"). */
export function labelOfPath(path: string): string {
  const field = FIELDS.find((f) => f.animation?.path === path);
  if (field !== undefined) {
    // Position X/Y share the path: the pair's name is the label without the axis.
    return field.animation?.component === undefined
      ? field.label
      : field.label.replace(/ [XY]$/, "");
  }
  return path;
}

/** Every animated property of a clip, in a stable order. */
export function curvesOf(clip: Clip): PropertyCurve[] {
  return Object.entries(clip.keyframes)
    .filter(([, frames]) => frames.length > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, frames]) => ({
      path,
      label: labelOfPath(path),
      kind: kindOf(frames[0]?.value ?? 0),
      frames,
    }));
}

/** The numbers a value is drawn as: a number is one curve, a point two, a colour four. */
export function channelValues(value: KeyframeValue): number[] {
  if (typeof value === "number") return [value];
  if (Array.isArray(value)) return [value[0], value[1]];
  if ("r" in value) return [value.r, value.g, value.b, value.a];
  return [0];
}

export const CHANNEL_NAMES: Record<ValueKind, string[]> = {
  number: [""],
  vec2: ["x", "y"],
  color: ["r", "g", "b", "a"],
  path: [""],
};

/** The drawing area: maps clip-local time and a data value to pixels and back (y grows downward). */
export interface Plot {
  width: number;
  height: number;
  x: (tUs: number) => number;
  y: (value: number) => number;
  tAt: (px: number) => number;
  valueAt: (py: number) => number;
}

const PAD_X = 12;
const PAD_Y = 14;

export function makePlot(
  width: number,
  height: number,
  lengthUs: number,
  range: readonly [number, number],
): Plot {
  const span = Math.max(1, lengthUs);
  const [low, high] = range;
  const height01 = Math.max(1e-9, high - low);
  const innerW = width - 2 * PAD_X;
  const innerH = height - 2 * PAD_Y;
  return {
    width,
    height,
    x: (tUs) => PAD_X + (tUs / span) * innerW,
    y: (v) => PAD_Y + (1 - (v - low) / height01) * innerH,
    tAt: (px) => ((px - PAD_X) / innerW) * span,
    valueAt: (py) => low + (1 - (py - PAD_Y) / innerH) * height01,
  };
}

/** A y-range that holds all the numbers with some air, never empty. */
export function paddedRange(values: readonly number[]): [number, number] {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return [0, 1];
  const low = Math.min(...finite);
  const high = Math.max(...finite);
  if (high - low < 1e-9) return [low - 0.5, high + 0.5];
  const pad = (high - low) * 0.12;
  return [low - pad, high + pad];
}

/** Evaluated channels along the property's whole duration (for drawing the value curve). */
export function sampleChannels(
  frames: readonly Keyframe[],
  lengthUs: number,
  count: number,
): { tUs: number; values: number[] }[] {
  const out: { tUs: number; values: number[] }[] = [];
  for (let i = 0; i <= count; i++) {
    const tUs = Math.round((lengthUs * i) / count);
    const v = evaluateFrames(frames, tUs);
    if (v !== undefined) out.push({ tUs, values: channelValues(v) });
  }
  return out;
}

export function speedSamples(frames: readonly Keyframe[], perSegment = 24) {
  return speedProfile(frames, perSegment);
}

/** Where a keyframe's ease handles sit, in graph data coordinates. */
export interface Handle {
  tUs: number;
  /** In the value graph a value, in the speed graph a speed. */
  y: number;
}

/**
 * The outgoing handle of `k0` and the incoming handle of `k1` for a bezier segment.
 * Value graph (numbers): the handle is where the temporal curve's control point is, so its slope
 * is the ease speed. Speed graph: the handle sits at (influence along the segment, speed).
 */
export function segmentHandles(
  k0: Keyframe,
  k1: Keyframe,
  mode: GraphMode,
): { out: Handle; into: Handle } {
  const info = segmentInfo(k0, k1);
  const span = k1.tUs - k0.tUs;
  const a = info.easeOut.influence / 100;
  const b = info.easeIn.influence / 100;
  const v0 = typeof k0.value === "number" ? k0.value : 0;
  const v1 = typeof k1.value === "number" ? k1.value : 0;
  if (mode === "speed") {
    return {
      out: { tUs: k0.tUs + a * span, y: info.easeOut.speed },
      into: { tUs: k1.tUs - b * span, y: info.easeIn.speed },
    };
  }
  return {
    out: { tUs: k0.tUs + a * span, y: v0 + info.easeOut.speed * a * info.seconds },
    into: { tUs: k1.tUs - b * span, y: v1 - info.easeIn.speed * b * info.seconds },
  };
}

const clampInfluence = (f: number): number => Math.min(100, Math.max(0.1, f * 100));

/** The ease that puts the outgoing handle of `k0` at the pointer (clip-local time, graph y). */
export function easeFromOut(
  k0: Keyframe,
  k1: Keyframe,
  mode: GraphMode,
  tUs: number,
  y: number,
): Ease {
  const span = k1.tUs - k0.tUs;
  const fraction = span > 0 ? (tUs - k0.tUs) / span : 0.333;
  const influence = clampInfluence(fraction);
  if (mode === "speed") return { influence, speed: y };
  const seconds = (span / 1e6) * (influence / 100);
  const v0 = typeof k0.value === "number" ? k0.value : 0;
  return { influence, speed: seconds > 0 ? (y - v0) / seconds : 0 };
}

/** The ease that puts the incoming handle of `k1` at the pointer. */
export function easeFromInto(
  k0: Keyframe,
  k1: Keyframe,
  mode: GraphMode,
  tUs: number,
  y: number,
): Ease {
  const span = k1.tUs - k0.tUs;
  const fraction = span > 0 ? (k1.tUs - tUs) / span : 0.333;
  const influence = clampInfluence(fraction);
  if (mode === "speed") return { influence, speed: y };
  const seconds = (span / 1e6) * (influence / 100);
  const v1 = typeof k1.value === "number" ? k1.value : 0;
  return { influence, speed: seconds > 0 ? (v1 - y) / seconds : 0 };
}

/**
 * A keyframe dragged to a new time (and value, for numbers). The time stays strictly between its
 * neighbours and inside the clip, so a drag can never collide with another keyframe.
 */
export function movedKeyframe(
  frames: readonly Keyframe[],
  index: number,
  lengthUs: number,
  tUs: number,
  value: number | undefined,
): Keyframe | null {
  const key = frames[index];
  if (key === undefined) return null;
  const before = frames[index - 1]?.tUs ?? -1;
  const after = frames[index + 1]?.tUs ?? lengthUs + 1;
  const time = Math.round(Math.min(Math.min(lengthUs, after - 1), Math.max(0, before + 1, tUs)));
  return {
    ...key,
    tUs: time,
    value: value !== undefined && typeof key.value === "number" ? value : key.value,
  };
}
