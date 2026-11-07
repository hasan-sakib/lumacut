import { endOf, evaluate, evaluateFrames, resolveProperty } from "@lumacut/ops";
import type { Clip, ClipPatch, Interpolation, Keyframe, KeyframeValue, Op } from "@lumacut/schema";
import type { ClipInfo, FieldDef, FieldValue } from "./fields.ts";

/** How a field's property is animated on one clip right now. */
export type KeyState = "none" | "animated" | "key";

/** The playhead as clip-local time, kept inside the clip (keyframes are clip-local). */
export function localTimeOf(clip: Clip, playheadUs: number): number {
  return Math.max(0, Math.min(endOf(clip) - clip.startUs, Math.round(playheadUs - clip.startUs)));
}

/** True when the playhead is on the clip (so adding a keyframe there is meaningful). */
export const playheadOnClip = (clip: Clip, playheadUs: number): boolean =>
  playheadUs >= clip.startUs && playheadUs <= endOf(clip);

const framesOf = (def: FieldDef, clip: Clip): readonly Keyframe[] =>
  def.animation === undefined ? [] : (clip.keyframes[def.animation.path] ?? []);

export function keyStateOf(def: FieldDef, clip: Clip, playheadUs: number): KeyState {
  const frames = framesOf(def, clip);
  if (frames.length === 0) return "none";
  const local = localTimeOf(clip, playheadUs);
  return frames.some((k) => k.tUs === local) ? "key" : "animated";
}

export type ItemKeyState = KeyState | "mixed";

/** The state across the selection: "mixed" when the clips disagree. */
export function keyStateOfItems(
  def: FieldDef,
  items: readonly ClipInfo[],
  playheadUs: number,
): ItemKeyState {
  const states = items
    .filter((item) => def.appliesTo(item))
    .map((item) => keyStateOf(def, item.clip, playheadUs));
  const first = states[0];
  if (first === undefined) return "none";
  return states.every((s) => s === first) ? first : "mixed";
}

/** Interpolation for a new keyframe: the neighbouring keyframe's, so a new key matches its track. */
function interpolationFor(frames: readonly Keyframe[], local: number): Interpolation {
  const before = [...frames].reverse().find((k) => k.tUs < local);
  return (before ?? frames.find((k) => k.tUs > local))?.interpolation ?? "linear";
}

/** The patch that turns `before` into `after` (top-level clip fields that changed). */
function patchBetween(before: Clip, after: Clip): ClipPatch {
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(after) as (keyof Clip)[]) {
    if (after[key] !== before[key]) patch[key] = after[key];
  }
  return patch;
}

/** The value to key: the property's current value, with this field's part replaced when it has one. */
function valueToKey(def: FieldDef, clip: Clip, local: number, stored?: FieldValue): KeyframeValue {
  const animation = def.animation;
  if (animation === undefined) return 0;
  const current = evaluate(clip, animation.path, local) ?? 0;
  if (stored === undefined) return current;
  const next = Number(stored);
  if (animation.component === undefined) return next;
  const pair: [number, number] = Array.isArray(current) ? [current[0], current[1]] : [0, 0];
  if (animation.component === "both") return [next, next];
  pair[animation.component] = next;
  return pair;
}

/**
 * Removes one keyframe. When it was the property's last, its value is written back as the static
 * value, so the property stays where it was instead of snapping to the clip's old setting.
 */
export function removeKeyframeOps(clip: Clip, path: string, tUs: number): Op[] {
  const frames = clip.keyframes[path] ?? [];
  const existing = frames.find((k) => k.tUs === tUs);
  if (existing === undefined) return [];
  const ops: Op[] = [{ type: "removeKeyframe", clipId: clip.id, path, tUs }];
  if (frames.length === 1) {
    const property = resolveProperty(clip, path);
    if (property !== undefined) {
      const patch = patchBetween(clip, property.set(clip, existing.value));
      if (Object.keys(patch).length > 0)
        ops.push({ type: "setProps", clipId: clip.id, props: patch });
    }
  }
  return ops;
}

/**
 * The ops for the ◆ control: with a keyframe at the playhead it is removed (the last one left
 * writes its value back as the static value, so the property stays where it was); without one, a
 * keyframe with the property's current value is added. One undo step across the selection.
 */
export function keyframeToggleOps(
  def: FieldDef,
  items: readonly ClipInfo[],
  playheadUs: number,
): Op[] {
  const animation = def.animation;
  if (animation === undefined) return [];
  const ops: Op[] = [];
  for (const item of items) {
    if (!def.appliesTo(item)) continue;
    const { clip } = item;
    const local = localTimeOf(clip, playheadUs);
    const frames = clip.keyframes[animation.path] ?? [];
    const existing = frames.find((k) => k.tUs === local);
    if (existing !== undefined) {
      ops.push(...removeKeyframeOps(clip, animation.path, local));
    } else {
      ops.push({
        type: "addKeyframe",
        clipId: clip.id,
        path: animation.path,
        keyframe: {
          tUs: local,
          value: valueToKey(def, clip, local),
          interpolation: interpolationFor(frames, local),
        },
      });
    }
  }
  return ops;
}

/** One op for the whole selection (or null when there is nothing to do). */
export function toggleKeyframeOp(
  def: FieldDef,
  items: readonly ClipInfo[],
  playheadUs: number,
): Op | null {
  const ops = keyframeToggleOps(def, items, playheadUs);
  if (ops.length === 0) return null;
  const only = ops[0];
  return ops.length === 1 && only !== undefined
    ? only
    : { type: "batch", label: `Toggle ${def.label.toLowerCase()} keyframe`, ops };
}

/**
 * Editing an animated property at the playhead updates the keyframe there or adds one (the usual
 * behaviour of animation tools). Null when the field isn't animated on this clip.
 */
export function animatedEditOp(
  def: FieldDef,
  stored: FieldValue,
  clip: Clip,
  playheadUs: number,
): Op | null {
  const animation = def.animation;
  if (animation === undefined || framesOf(def, clip).length === 0) return null;
  const local = localTimeOf(clip, playheadUs);
  return animatedSetOp(def, clip, playheadUs, valueToKey(def, clip, local, stored));
}

/**
 * Writes `value` (a whole property value: a number, point or colour) as the keyframe at the
 * playhead, updating the one there or adding one. Null when the field isn't animated on this clip.
 */
export function animatedSetOp(
  def: FieldDef,
  clip: Clip,
  playheadUs: number,
  value: KeyframeValue,
): Op | null {
  const animation = def.animation;
  const frames = framesOf(def, clip);
  if (animation === undefined || frames.length === 0) return null;
  const local = localTimeOf(clip, playheadUs);
  const existing = frames.find((k) => k.tUs === local);
  if (existing !== undefined) {
    return {
      type: "updateKeyframe",
      clipId: clip.id,
      path: animation.path,
      tUs: local,
      keyframe: { ...existing, value },
    };
  }
  return {
    type: "addKeyframe",
    clipId: clip.id,
    path: animation.path,
    keyframe: { tUs: local, value, interpolation: interpolationFor(frames, local) },
  };
}

/** What the field shows for a clip at the playhead: the animated value when it is animated. */
export function shownValue(def: FieldDef, clip: Clip, playheadUs: number): FieldValue {
  const animation = def.animation;
  const frames = framesOf(def, clip);
  if (animation === undefined || frames.length === 0) return def.get(clip);
  const value = evaluateFrames(frames, localTimeOf(clip, playheadUs));
  if (typeof value === "number") return value;
  if (Array.isArray(value)) {
    const part = animation.component === 1 ? value[1] : value[0];
    return part;
  }
  return def.get(clip);
}
