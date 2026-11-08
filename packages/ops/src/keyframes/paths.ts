import type { Clip, KeyframeValue, ParamValue, Vec2 } from "@lumacut/schema";
import { resolveMotionProperty } from "./paths-motion.ts";
import { isPath, kindOf, type ValueKind } from "./values.ts";

/** A keyframeable property of a clip: how to read and write its (static) value. */
export interface AnimatableProperty {
  path: string;
  kind: ValueKind;
  /** Static value (what the clip holds when the property isn't animated). */
  get: (clip: Clip) => KeyframeValue;
  set: (clip: Clip, value: KeyframeValue) => Clip;
  /** The scalar fields this property drives; two properties that share one can't both be animated. */
  drives: string[];
}

const TRANSFORM_SCALARS = [
  "x",
  "y",
  "scaleX",
  "scaleY",
  "rotation",
  "anchorX",
  "anchorY",
  "skew",
] as const;
type TransformKey = (typeof TRANSFORM_SCALARS)[number];

const TRANSFORM_PAIRS: Record<string, [TransformKey, TransformKey]> = {
  position: ["x", "y"],
  scale: ["scaleX", "scaleY"],
  anchor: ["anchorX", "anchorY"],
};

const CROP_EDGES = ["left", "top", "right", "bottom"] as const;
const COLOR_SCALARS = [
  "exposure",
  "contrast",
  "highlights",
  "shadows",
  "whites",
  "blacks",
  "temperature",
  "tint",
  "saturation",
  "vibrance",
] as const;
const WHEELS = ["lift", "gamma", "gain", "offset"] as const;
const CHANNELS = ["r", "g", "b"] as const;
const AUDIO_SCALARS = ["volume", "pan"] as const;

const isOneOf = <T extends string>(list: readonly T[], value: string | undefined): value is T =>
  value !== undefined && (list as readonly string[]).includes(value);

const num = (v: KeyframeValue): number => (typeof v === "number" ? v : 0);
const pair = (v: KeyframeValue): Vec2 => (Array.isArray(v) ? v : [0, 0]);

function scalar(
  path: string,
  get: (clip: Clip) => number,
  set: (clip: Clip, value: number) => Clip,
): AnimatableProperty {
  return {
    path,
    kind: "number",
    get,
    set: (clip, value) => set(clip, num(value)),
    drives: [path],
  };
}

function asKeyframeValue(value: ParamValue): KeyframeValue | undefined {
  return paramKind(value) === undefined ? undefined : (value as KeyframeValue);
}

/** What kind of value an effect parameter holds, when it can be animated (numbers, points, colours). */
function paramKind(value: unknown): ValueKind | undefined {
  if (typeof value === "number") return "number";
  if (Array.isArray(value) && value.length === 2) return "vec2";
  if (typeof value === "object" && value !== null && "r" in value && "a" in value) return "color";
  return undefined;
}

/**
 * Resolves a property path on a clip, or undefined when the path isn't an animatable property
 * of this clip (unknown name, missing effect, a parameter that is a boolean or string, …).
 * The vocabulary: `transform.{x,y,scaleX,scaleY,rotation,anchorX,anchorY,skew}`, the pairs
 * `transform.{position,scale,anchor}` (points, with spatial paths), `opacity`,
 * `crop.{left,top,right,bottom}`, `color.<scalar>`, `color.{lift,gamma,gain,offset}.{r,g,b}`,
 * `audio.{volume,pan}` and `effects.<effectId>.params.<name>`; shapes, masks, text animators and
 * motion blur are in paths-motion.ts.
 */
export function resolveProperty(clip: Clip, path: string): AnimatableProperty | undefined {
  const parts = path.split(".");
  return resolveBase(clip, path, parts) ?? resolveMotionProperty(clip, parts);
}

function resolveBase(
  clip: Clip,
  path: string,
  parts: readonly string[],
): AnimatableProperty | undefined {
  const [head, second, third, fourth, ...rest] = parts;
  if (rest.length > 0) return undefined;

  if (head === "opacity" && second === undefined) {
    return scalar(
      path,
      (c) => c.opacity,
      (c, v) => ({ ...c, opacity: v }),
    );
  }

  if (head === "transform" && third === undefined) {
    if (isOneOf(TRANSFORM_SCALARS, second)) {
      return scalar(
        path,
        (c) => c.transform[second],
        (c, v) => ({ ...c, transform: { ...c.transform, [second]: v } }),
      );
    }
    const keys = second === undefined ? undefined : TRANSFORM_PAIRS[second];
    if (keys !== undefined) {
      const [a, b] = keys;
      return {
        path,
        kind: "vec2",
        get: (c) => [c.transform[a], c.transform[b]],
        set: (c, v) => {
          const [x, y] = pair(v);
          return { ...c, transform: { ...c.transform, [a]: x, [b]: y } };
        },
        drives: [`transform.${a}`, `transform.${b}`],
      };
    }
    return undefined;
  }

  if (head === "crop" && third === undefined && isOneOf(CROP_EDGES, second)) {
    return scalar(
      path,
      (c) => c.crop[second],
      (c, v) => ({ ...c, crop: { ...c.crop, [second]: v } }),
    );
  }

  if (head === "color") {
    if (third === undefined && isOneOf(COLOR_SCALARS, second)) {
      return scalar(
        path,
        (c) => c.color[second],
        (c, v) => ({ ...c, color: { ...c.color, [second]: v } }),
      );
    }
    if (fourth === undefined && isOneOf(WHEELS, second) && isOneOf(CHANNELS, third)) {
      const index = CHANNELS.indexOf(third);
      return scalar(
        path,
        (c) => c.color[second][index] ?? 0,
        (c, v) => {
          const wheel: [number, number, number] = [...c.color[second]];
          wheel[index] = v;
          return { ...c, color: { ...c.color, [second]: wheel } };
        },
      );
    }
    return undefined;
  }

  if (head === "audio" && third === undefined && isOneOf(AUDIO_SCALARS, second)) {
    if (clip.audio === undefined) return undefined; // nothing to animate (and `set` would be a silent no-op)
    return {
      path,
      kind: "number",
      get: (c) => c.audio?.[second] ?? (second === "volume" ? 1 : 0),
      set: (c, v) =>
        c.audio === undefined ? c : { ...c, audio: { ...c.audio, [second]: num(v) } },
      drives: [path],
    };
  }

  if (head === "effects" && second !== undefined && third === "params" && fourth !== undefined) {
    const effect = clip.effects.find((e) => e.id === second);
    const raw = effect?.params[fourth];
    const current = raw === undefined ? undefined : asKeyframeValue(raw);
    const kind = paramKind(raw);
    if (effect === undefined || current === undefined || kind === undefined) return undefined;
    return {
      path,
      kind,
      get: (c) => {
        const value = c.effects.find((e) => e.id === second)?.params[fourth];
        return (value === undefined ? undefined : asKeyframeValue(value)) ?? current;
      },
      set: (c, v) =>
        isPath(v)
          ? c
          : {
              ...c,
              effects: c.effects.map((e) =>
                e.id === second ? { ...e, params: { ...e.params, [fourth]: v } } : e,
              ),
            },
      drives: [path],
    };
  }

  return undefined;
}

/** True when a value matches the kind of the property it is keyframing. */
export function valueFitsKind(value: KeyframeValue, kind: ValueKind): boolean {
  return kindOf(value) === kind;
}
