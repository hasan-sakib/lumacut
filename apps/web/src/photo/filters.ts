import { effectById } from "@lumacut/effects";
import { BUILTIN_LUTS } from "@lumacut/engine/color";
import type { Clip, Composition } from "@lumacut/schema";

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

/** An effect on one of the selected layers. */
export interface AppliedEffect {
  kind: "effect";
  clipId: string;
  instanceId: string;
  effectId: string;
  name: string;
  category: string;
  enabled: boolean;
}

export type AppliedFilter = AppliedLook | AppliedEffect;

/** Every look layer in the composition, top layer first. */
export function lookLayers(comp: Composition): AppliedLook[] {
  return [...comp.tracks].reverse().flatMap((track) =>
    track.clips.flatMap((clip): AppliedLook[] => {
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
    }),
  );
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
