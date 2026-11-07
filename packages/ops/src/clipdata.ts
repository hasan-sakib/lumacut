import type { Clip, Keyframe, Op, Project } from "@lumacut/schema";
import { fail } from "./errors.ts";
import { lengthOf } from "./model.ts";
import { editClipData, type Edit } from "./clipdata-edit.ts";

type OpOf<T extends Op["type"]> = Extract<Op, { type: T }>;

const byTime = (a: Keyframe, b: Keyframe): number => a.tUs - b.tUs;

function withFrames(clip: Clip, path: string, frames: Keyframe[]): Clip {
  const others = Object.fromEntries(Object.entries(clip.keyframes).filter(([key]) => key !== path));
  return { ...clip, keyframes: frames.length === 0 ? others : { ...others, [path]: frames } };
}

// --- Keyframes (time base: relative to the clip start; see docs/ops.md) ------------------------

export function addKeyframe(project: Project, op: OpOf<"addKeyframe">): Edit {
  return editClipData(project, op.clipId, (clip) => {
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
    return { ...clip, masks: clip.masks.filter((m) => m.id !== op.maskId) };
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
    return { ...clip, effects: clip.effects.filter((e) => e.id !== op.effectId) };
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
    if (op.transition.durationUs > lengthOf(clip)) {
      fail(
        "invalid_range",
        `A transition can't be longer than clip ${clip.id} (${String(lengthOf(clip))} µs).`,
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
