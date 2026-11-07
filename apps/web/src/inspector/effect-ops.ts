import { defaultParams, effectById } from "@lumacut/effects";
import type { Clip, EffectInstance, Op } from "@lumacut/schema";

/** A new instance of an effect with its parameters at their defaults. */
export function newEffectInstance(effectId: string, id: string): EffectInstance {
  const def = effectById(effectId);
  return {
    id,
    effectId,
    enabled: true,
    params: def === undefined ? {} : defaultParams(def.params),
  };
}

/** Adds an effect (on top of the stack) to each clip; one op per clip. */
export function addEffectOps(clips: readonly Clip[], effectId: string, newId: () => string): Op[] {
  return clips.map((clip) => ({
    type: "addEffect",
    clipId: clip.id,
    effect: newEffectInstance(effectId, newId()),
  }));
}

export const removeEffectOp = (clipId: string, instanceId: string): Op => ({
  type: "removeEffect",
  clipId,
  effectId: instanceId,
});

export const setEffectEnabledOp = (clipId: string, instanceId: string, enabled: boolean): Op => ({
  type: "updateEffect",
  clipId,
  effectId: instanceId,
  props: { enabled },
});

/** Moves an effect one place earlier (-1) or later (+1) in the stack; null at the ends. */
export function moveEffectOp(clip: Clip, instanceId: string, step: -1 | 1): Op | null {
  const from = clip.effects.findIndex((e) => e.id === instanceId);
  const to = from + step;
  if (from < 0 || to < 0 || to >= clip.effects.length) return null;
  return { type: "reorderEffect", clipId: clip.id, effectId: instanceId, toIndex: to };
}

/** Puts every parameter of an effect back to its default. */
export function resetEffectOp(clip: Clip, instanceId: string): Op | null {
  const instance = clip.effects.find((e) => e.id === instanceId);
  const def = instance === undefined ? undefined : effectById(instance.effectId);
  if (instance === undefined || def === undefined) return null;
  return {
    type: "updateEffect",
    clipId: clip.id,
    effectId: instanceId,
    props: { params: defaultParams(def.params) },
  };
}
