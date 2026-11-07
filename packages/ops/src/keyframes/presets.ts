import type { Clip, Keyframe, KeyframeValue, Op, Vec2 } from "@lumacut/schema";
import { isVec2 } from "./values.ts";

/** Easy ease: the curve leaves/arrives at zero speed over a third of the segment. */
const EASY = { influence: 100 / 3, speed: 0 } as const;

export const EASE_PRESETS = [
  "linear",
  "hold",
  "easeIn",
  "easeOut",
  "easeInOut",
  "overshoot",
  "bounce",
  "elastic",
] as const;
export type EasePreset = (typeof EASE_PRESETS)[number];

export const EASE_PRESET_INFO: Record<EasePreset, { title: string; description: string }> = {
  linear: { title: "Linear", description: "Constant speed to the next keyframe." },
  hold: { title: "Hold", description: "Keep this value until the next keyframe, then jump." },
  easeIn: { title: "Ease in", description: "Arrive at this keyframe slowly." },
  easeOut: { title: "Ease out", description: "Leave this keyframe slowly." },
  easeInOut: { title: "Ease in and out", description: "Leave and arrive slowly (easy ease)." },
  overshoot: { title: "Overshoot", description: "Go past the next value, then settle back on it." },
  bounce: {
    title: "Bounce",
    description: "Land on the next value and bounce back up a few times.",
  },
  elastic: {
    title: "Elastic",
    description: "Swing around the next value, settling like a spring.",
  },
};

/** Presets that add keyframes inside the segment (they're baked, since one curve can't do them). */
const BAKED: ReadonlySet<EasePreset> = new Set(["overshoot", "bounce", "elastic"]);
export const isBakedPreset = (preset: EasePreset): boolean => BAKED.has(preset);

function scaleAround(
  from: KeyframeValue,
  to: KeyframeValue,
  amount: number,
): KeyframeValue | undefined {
  // The value `amount` of the way from `from` past `to` (1 = at `to`, 1.2 = 20% beyond).
  if (typeof from === "number" && typeof to === "number") return from + (to - from) * amount;
  if (isVec2(from) && isVec2(to)) {
    const v: Vec2 = [from[0] + (to[0] - from[0]) * amount, from[1] + (to[1] - from[1]) * amount];
    return v;
  }
  return undefined; // colours and shapes can't overshoot
}

/**
 * Overshoot/bounce/elastic as fractions of the segment: [time fraction, progress]. Progress is
 * how far from the start value toward the end value (1 = on the end value). The curve is
 * eased at each extreme, so the motion decelerates into every turn.
 */
const SHAPES: Record<"overshoot" | "bounce" | "elastic", readonly (readonly [number, number])[]> = {
  overshoot: [
    [0.6, 1.15],
    [1, 1],
  ],
  bounce: [
    [0.5, 1],
    [0.65, 0.75],
    [0.8, 1],
    [0.9, 0.94],
    [1, 1],
  ],
  elastic: [
    [0.3, 1.25],
    [0.5, 0.88],
    [0.68, 1.06],
    [0.84, 0.98],
    [1, 1],
  ],
};

const smooth = (k: Keyframe): Keyframe => ({
  ...k,
  interpolation: "bezier",
  easeIn: { ...EASY },
  easeOut: { ...EASY },
});

/** Bounce falls under gravity: it speeds up into each landing instead of easing. */
function fall(k: Keyframe): Keyframe {
  return { ...k, interpolation: "bezier", easeOut: { ...EASY } };
}

/**
 * Applies a preset to the segment that starts at `frames[index]`. `linear`, `hold` and the
 * ease-in/out presets only change interpolation and ease handles; `overshoot`, `bounce` and
 * `elastic` replace the segment with extra keyframes (which stay editable). Returns new frames;
 * the input isn't changed. Frames that can't take a preset (no next keyframe, colour/shape
 * values for the baked ones) are returned as they were.
 */
export function applyEasePreset(
  frames: readonly Keyframe[],
  index: number,
  preset: EasePreset,
): Keyframe[] {
  const copy = frames.map((k) => ({ ...k }));
  const k0 = copy[index];
  if (k0 === undefined) return copy;
  const k1 = copy[index + 1];

  switch (preset) {
    case "linear":
      copy[index] = { ...k0, interpolation: "linear" };
      return copy;
    case "hold":
      copy[index] = { ...k0, interpolation: "hold" };
      return copy;
    case "easeIn": {
      // Arriving slowly is a property of the segment *before* this keyframe.
      const before = copy[index - 1];
      if (before === undefined) return copy;
      copy[index - 1] = { ...before, interpolation: "bezier" };
      copy[index] = { ...k0, easeIn: { ...EASY } };
      return copy;
    }
    case "easeOut":
      copy[index] = { ...k0, interpolation: "bezier", easeOut: { ...EASY } };
      return copy;
    case "easeInOut": {
      if (k1 === undefined) return copy;
      copy[index] = { ...k0, interpolation: "bezier", easeOut: { ...EASY } };
      copy[index + 1] = { ...k1, easeIn: { ...EASY } };
      return copy;
    }
    default: {
      if (k1 === undefined) return copy;
      const shape = SHAPES[preset];
      const span = k1.tUs - k0.tUs;
      const inserted: Keyframe[] = [];
      let last = k0.tUs;
      for (const [fraction, progress] of shape) {
        if (fraction >= 1) break;
        const value = scaleAround(k0.value, k1.value, progress);
        if (value === undefined) return copy; // colours and shapes can't overshoot
        const tUs = Math.round(k0.tUs + span * fraction);
        if (tUs <= last || tUs >= k1.tUs) continue; // too short a segment for this beat
        last = tUs;
        const beat: Keyframe = { tUs, value, interpolation: "bezier" };
        // A bounce lands at full speed (no ease on a landing); every other turn is eased.
        inserted.push(preset === "bounce" && progress === 1 ? beat : smooth(beat));
      }
      if (inserted.length === 0) return copy;
      const falls = preset === "bounce";
      copy[index] = falls ? fall(k0) : { ...k0, interpolation: "bezier", easeOut: { ...EASY } };
      // The last inserted beat leaves toward the end value; the end value arrives eased.
      copy[index + 1] = { ...k1, easeIn: { ...EASY } };
      copy.splice(index + 1, 0, ...inserted);
      return copy;
    }
  }
}

const sameKey = (a: Keyframe, b: Keyframe): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * The ops that turn one property's keyframes `before` into `after` (matched by time): removes,
 * adds and updates, in an order that never collides. Applying them is one `batch`.
 */
export function keyframeOps(
  clipId: string,
  path: string,
  before: readonly Keyframe[],
  after: readonly Keyframe[],
): Op[] {
  const ops: Op[] = [];
  const kept = new Set(after.map((k) => k.tUs));
  for (const k of before) {
    if (!kept.has(k.tUs)) ops.push({ type: "removeKeyframe", clipId, path, tUs: k.tUs });
  }
  const had = new Map(before.map((k) => [k.tUs, k]));
  for (const k of after) {
    const old = had.get(k.tUs);
    if (old === undefined) ops.push({ type: "addKeyframe", clipId, path, keyframe: k });
    else if (!sameKey(old, k)) {
      ops.push({ type: "updateKeyframe", clipId, path, tUs: k.tUs, keyframe: k });
    }
  }
  return ops;
}

/** The keyframes of `path` on `clip` after a preset is applied to the segment at `index`, as ops. */
export function easePresetOps(clip: Clip, path: string, index: number, preset: EasePreset): Op[] {
  const before = clip.keyframes[path] ?? [];
  return keyframeOps(clip.id, path, before, applyEasePreset(before, index, preset));
}
