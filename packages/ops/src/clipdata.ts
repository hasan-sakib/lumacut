import type { Clip, Keyframe, Op, Project } from "@lumacut/schema";
import { fail } from "./errors.ts";
import { endOf, lengthOf, needClip } from "./model.ts";
import { editClipData, type Edit } from "./clipdata-edit.ts";
import { resolveProperty } from "./keyframes/paths.ts";
import { kindOf } from "./keyframes/values.ts";

type OpOf<T extends Op["type"]> = Extract<Op, { type: T }>;

const byTime = (a: Keyframe, b: Keyframe): number => a.tUs - b.tUs;

function withFrames(clip: Clip, path: string, frames: Keyframe[]): Clip {
  const others = Object.fromEntries(Object.entries(clip.keyframes).filter(([key]) => key !== path));
  return { ...clip, keyframes: frames.length === 0 ? others : { ...others, [path]: frames } };
}

// --- Keyframes (time base: relative to the clip start; see docs/ops.md) ------------------------

/** The path must be an animatable property of this clip, and the value must fit it. */
function checkKeyframe(clip: Clip, path: string, value: Keyframe["value"]): void {
  const property = resolveProperty(clip, path);
  if (property === undefined) {
    fail(
      "invalid_property",
      `"${path}" isn't an animatable property of clip ${clip.id}. Animatable: transform.*, opacity, crop.*, color.*, audio.volume/pan, effects.<id>.params.<name>, masks.<id>.*, shape.*, text.animators.<id>.* and motionBlur.shutterAngle.`,
    );
  }
  if (kindOf(value) !== property.kind) {
    fail(
      "invalid_property",
      `"${path}" holds a ${property.kind}, but the keyframe value is a ${kindOf(value)}.`,
    );
  }
  // Two animated properties can't drive the same field (e.g. transform.x and transform.position).
  const driven = new Set(property.drives);
  for (const other of Object.keys(clip.keyframes)) {
    if (other === path || (clip.keyframes[other] ?? []).length === 0) continue;
    const rival = resolveProperty(clip, other);
    if (rival?.drives.some((d) => driven.has(d)) === true) {
      fail(
        "invalid_property",
        `"${path}" can't be animated while "${other}" is: they control the same value. Remove one's keyframes first.`,
      );
    }
  }
}

export function addKeyframe(project: Project, op: OpOf<"addKeyframe">): Edit {
  return editClipData(project, op.clipId, (clip) => {
    checkKeyframe(clip, op.path, op.keyframe.value);
    const frames = clip.keyframes[op.path] ?? [];
    if (frames.some((k) => k.tUs === op.keyframe.tUs)) {
      fail(
        "keyframe_exists",
        `There is already a keyframe at ${String(op.keyframe.tUs)} µs on "${op.path}".`,
      );
    }
    return withFrames(clip, op.path, [...frames, op.keyframe].sort(byTime));
  });
}

export function updateKeyframe(project: Project, op: OpOf<"updateKeyframe">): Edit {
  return editClipData(project, op.clipId, (clip) => {
    const frames = clip.keyframes[op.path] ?? [];
    if (!frames.some((k) => k.tUs === op.tUs)) {
      fail("unknown_keyframe", `There is no keyframe at ${String(op.tUs)} µs on "${op.path}".`);
    }
    checkKeyframe(clip, op.path, op.keyframe.value);
    const others = frames.filter((k) => k.tUs !== op.tUs);
    if (others.some((k) => k.tUs === op.keyframe.tUs)) {
      fail(
        "keyframe_exists",
        `There is already a keyframe at ${String(op.keyframe.tUs)} µs on "${op.path}".`,
      );
    }
    return withFrames(clip, op.path, [...others, op.keyframe].sort(byTime));
  });
}

export function removeKeyframe(project: Project, op: OpOf<"removeKeyframe">): Edit {
  return editClipData(project, op.clipId, (clip) => {
    const frames = clip.keyframes[op.path] ?? [];
    if (!frames.some((k) => k.tUs === op.tUs)) {
      fail("unknown_keyframe", `There is no keyframe at ${String(op.tUs)} µs on "${op.path}".`);
    }
    return withFrames(
      clip,
      op.path,
      frames.filter((k) => k.tUs !== op.tUs),
    );
  });
}

// --- Masks ------------------------------------------------------------------------------------

function insertAt<T>(list: readonly T[], item: T, index: number | undefined): T[] {
  const at = Math.min(index ?? list.length, list.length);
  return [...list.slice(0, at), item, ...list.slice(at)];
}

export function addMask(project: Project, op: OpOf<"addMask">): Edit {
  return editClipData(project, op.clipId, (clip) => {
    if (clip.masks.some((m) => m.id === op.mask.id))
      fail("duplicate_id", `Clip ${clip.id} already has a mask "${op.mask.id}".`);
    return { ...clip, masks: insertAt(clip.masks, op.mask, op.index) };
  });
}

export function updateMask(project: Project, op: OpOf<"updateMask">): Edit {
  return editClipData(project, op.clipId, (clip) => {
    if (!clip.masks.some((m) => m.id === op.maskId))
      fail("unknown_mask", `Clip ${clip.id} has no mask "${op.maskId}".`);
    if (op.mask.id !== op.maskId) fail("invalid_op", "A mask update can't change the mask's id.");
    return { ...clip, masks: clip.masks.map((m) => (m.id === op.maskId ? op.mask : m)) };
  });
}

export function removeMask(project: Project, op: OpOf<"removeMask">): Edit {
  return editClipData(project, op.clipId, (clip) => {
    if (!clip.masks.some((m) => m.id === op.maskId))
      fail("unknown_mask", `Clip ${clip.id} has no mask "${op.maskId}".`);
    // Its animation goes with it.
    const prefix = `masks.${op.maskId}.`;
    const keyframes = Object.fromEntries(
      Object.entries(clip.keyframes).filter(([path]) => !path.startsWith(prefix)),
    );
    return { ...clip, masks: clip.masks.filter((m) => m.id !== op.maskId), keyframes };
  });
}

// --- Effects ----------------------------------------------------------------------------------

export function addEffect(project: Project, op: OpOf<"addEffect">): Edit {
  return editClipData(project, op.clipId, (clip) => {
    if (clip.effects.some((e) => e.id === op.effect.id))
      fail("duplicate_id", `Clip ${clip.id} already has an effect "${op.effect.id}".`);
    return { ...clip, effects: insertAt(clip.effects, op.effect, op.index) };
  });
}

export function updateEffect(project: Project, op: OpOf<"updateEffect">): Edit {
  return editClipData(project, op.clipId, (clip) => {
    if (!clip.effects.some((e) => e.id === op.effectId))
      fail("unknown_effect", `Clip ${clip.id} has no effect "${op.effectId}".`);
    return {
      ...clip,
      effects: clip.effects.map((e) =>
        e.id === op.effectId
          ? {
              ...e,
              ...(op.props.enabled === undefined ? {} : { enabled: op.props.enabled }),
              params: { ...e.params, ...op.props.params },
            }
          : e,
      ),
    };
  });
}

export function removeEffect(project: Project, op: OpOf<"removeEffect">): Edit {
  return editClipData(project, op.clipId, (clip) => {
    if (!clip.effects.some((e) => e.id === op.effectId))
      fail("unknown_effect", `Clip ${clip.id} has no effect "${op.effectId}".`);
    // Its animation goes with it, so no keyframes are left pointing at a missing effect.
    const prefix = `effects.${op.effectId}.`;
    const keyframes = Object.fromEntries(
      Object.entries(clip.keyframes).filter(([path]) => !path.startsWith(prefix)),
    );
    return { ...clip, effects: clip.effects.filter((e) => e.id !== op.effectId), keyframes };
  });
}

export function reorderEffect(project: Project, op: OpOf<"reorderEffect">): Edit {
  return editClipData(project, op.clipId, (clip) => {
    const effect = clip.effects.find((e) => e.id === op.effectId);
    if (effect === undefined)
      fail("unknown_effect", `Clip ${clip.id} has no effect "${op.effectId}".`);
    if (op.toIndex >= clip.effects.length) {
      fail(
        "invalid_range",
        `There is no position ${String(op.toIndex)}; the clip has ${String(clip.effects.length)} effects.`,
      );
    }
    const rest = clip.effects.filter((e) => e.id !== op.effectId);
    return { ...clip, effects: [...rest.slice(0, op.toIndex), effect, ...rest.slice(op.toIndex)] };
  });
}

// --- Transitions and paint --------------------------------------------------------------------

export function setTransition(project: Project, op: OpOf<"setTransition">): Edit {
  return editClipData(project, op.clipId, (clip) => {
    const { transitionIn: _removed, ...rest } = clip;
    if (op.transition === undefined) return rest;
    const length = lengthOf(clip);
    const { durationUs, alignment } = op.transition;
    if (durationUs > length) {
      fail(
        "invalid_range",
        `A transition can't be longer than clip ${clip.id} (${String(length)} µs).`,
      );
    }
    // A transition blends the clip before this one into it, so that clip must touch it.
    const ref = needClip(project, op.clipId);
    const sorted = [...ref.track.clips].sort((a, b) => a.startUs - b.startUs);
    const previous = sorted[sorted.findIndex((c) => c.id === clip.id) - 1];
    if (previous === undefined || endOf(previous) !== clip.startUs) {
      fail(
        "not_adjacent",
        `A transition needs the clip before ${clip.id} on the same track to end exactly where it starts.`,
      );
    }
    // The window sits around the cut: wholly inside this clip (start), inside the previous one
    // (end), or half in each (center).
    const before = lengthOf(previous);
    const fits =
      alignment === "start"
        ? durationUs <= length
        : alignment === "end"
          ? durationUs <= before
          : durationUs / 2 <= Math.min(length, before);
    if (!fits) {
      fail(
        "invalid_range",
        `The transition is too long for ${alignment === "end" ? "the clip before it" : "these clips"}: it can't reach past the start or end of a clip.`,
      );
    }
    return { ...rest, transitionIn: op.transition };
  });
}

export function addPaintStrokes(project: Project, op: OpOf<"addPaintStrokes">): Edit {
  return editClipData(project, op.clipId, (clip) => {
    if (clip.type !== "paint")
      fail("not_a_paint_clip", `Clip ${clip.id} is a ${clip.type} clip, not a paint layer.`);
    const strokes = clip.paint?.strokes ?? [];
    const taken = new Set(strokes.map((s) => s.id));
    for (const stroke of op.strokes) {
      if (taken.has(stroke.id))
        fail("duplicate_id", `Clip ${clip.id} already has a stroke "${stroke.id}".`);
      taken.add(stroke.id);
    }
    return { ...clip, paint: { strokes: [...strokes, ...op.strokes] } };
  });
}

export function removePaintStrokes(project: Project, op: OpOf<"removePaintStrokes">): Edit {
  return editClipData(project, op.clipId, (clip) => {
    if (clip.type !== "paint")
      fail("not_a_paint_clip", `Clip ${clip.id} is a ${clip.type} clip, not a paint layer.`);
    const strokes = clip.paint?.strokes ?? [];
    for (const id of op.strokeIds) {
      if (!strokes.some((s) => s.id === id))
        fail("invalid_op", `Clip ${clip.id} has no stroke "${id}".`);
    }
    const drop = new Set(op.strokeIds);
    return { ...clip, paint: { strokes: strokes.filter((s) => !drop.has(s.id)) } };
  });
}
