import type { EffectDefinition, TransitionDefinition } from "@lumacut/effects";
import type { TransitionInstance } from "@lumacut/schema";
import { effectRows, type EffectRow } from "./effects.ts";

/**
 * Inspector rows for a transition's parameters. They are built like an effect's (same
 * `ParamDef`s), reading `transitionIn.params`; none can be keyframed (progress is time itself).
 */
export function transitionRows(
  instance: TransitionInstance,
  def: TransitionDefinition,
): EffectRow[] {
  const asEffect: EffectDefinition = {
    id: def.id,
    name: def.name,
    category: "Utility",
    description: def.description,
    keywords: def.keywords,
    params: def.params,
    passes: [],
  };
  // Re-target the generated fields from `effects.<id>.params` onto `transitionIn.params`.
  return effectRows(
    { id: instance.id, effectId: def.id, enabled: true, params: instance.params },
    asEffect,
  ).map((row) => {
    const field = row.field;
    return {
      ...row,
      field: {
        ...field,
        id: `tr:${field.id}`,
        animation: undefined,
        appliesTo: ({ clip }) => clip.transitionIn?.id === instance.id,
        get: (clip) => {
          const stand = {
            ...clip,
            effects: [
              {
                id: instance.id,
                effectId: def.id,
                enabled: true,
                params: clip.transitionIn?.params ?? {},
              },
            ],
          };
          return field.get(stand);
        },
        set: (clip, value) => {
          const stand = {
            ...clip,
            effects: [
              {
                id: instance.id,
                effectId: def.id,
                enabled: true,
                params: clip.transitionIn?.params ?? {},
              },
            ],
          };
          const patched = field.set(stand, value).props.effects?.[0]?.params ?? {};
          return {
            props:
              clip.transitionIn === undefined
                ? {}
                : { transitionIn: { ...clip.transitionIn, params: patched } },
          };
        },
      },
    };
  });
}
