import { effectById } from "@lumacut/effects";
import { BUILTIN_LUTS } from "@lumacut/engine/color";
import type { Clip, Composition } from "@lumacut/schema";
import { filterLayerClip } from "../editor/filter-layers.ts";

/** A look applied to the picture: an adjustment layer carrying a built-in look. */
export interface AppliedLook {
  kind: "look";
  trackId: string;
  clipId: string;
  lookId: string;
  name: string;
  /** The layer is shown (its eye is on). */
  enabled: boolean;
  locked: boolean;
}

/** An effect: on its own filter layer (`trackId` set), or on one of the selected layers. */
export interface AppliedEffect {
  kind: "effect";
  clipId: string;
  instanceId: string;
  effectId: string;
  name: string;
  category: string;
  /** On (its layer is shown, for a filter layer). */
  enabled: boolean;
  /** The filter layer's track: the effect is that layer's only content. */
  trackId?: string;
  locked?: boolean;
}

export type AppliedFilter = AppliedLook | AppliedEffect;

/**
 * Every filter layer in the composition (a look or one effect on its own adjustment layer), top
 * layer first, plus any other adjustment layer carrying a look.
 */
export function filterLayers(comp: Composition): AppliedFilter[] {
  return [...comp.tracks].reverse().flatMap((track): AppliedFilter[] => {
    const filter = filterLayerClip(track);
    const effect = filter?.effects[0];
    if (filter !== undefined && effect !== undefined) {
      const def = effectById(effect.effectId);
      return [
        {
          kind: "effect",
          clipId: filter.id,
          instanceId: effect.id,
          effectId: effect.effectId,
          name: def?.name ?? effect.effectId,
          category: def?.category ?? "Effect",
          enabled: !track.hidden && effect.enabled,
          trackId: track.id,
          locked: track.locked,
        },
      ];
    }
    return track.clips.flatMap((clip): AppliedLook[] => {
      const lookId = clip.type === "adjustment" ? clip.color.lut?.lutId : undefined;
      if (lookId === undefined) return [];
      const info = BUILTIN_LUTS.find((l) => l.id === lookId);
      return [
        {
          kind: "look",
          trackId: track.id,
          clipId: clip.id,
          lookId,
          name: info?.name ?? "Look",
          enabled: !track.hidden,
          locked: track.locked,
        },
      ];
    });
  });
}

/** The effects on these clips, in stack order. */
export function layerEffects(clips: readonly Clip[]): AppliedEffect[] {
  return clips.flatMap((clip) =>
    clip.effects.map((e) => {
      const def = effectById(e.effectId);
      return {
        kind: "effect" as const,
        clipId: clip.id,
        instanceId: e.id,
        effectId: e.effectId,
        name: def?.name ?? e.effectId,
        category: def?.category ?? "Effect",
        enabled: e.enabled,
      };
    }),
  );
}
