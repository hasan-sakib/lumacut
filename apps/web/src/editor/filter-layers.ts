import { effectById } from "@lumacut/effects";
import { BUILTIN_LUTS } from "@lumacut/engine/color";
import { lengthOf } from "@lumacut/ops";
import {
  createClip,
  neutralColor,
  type Clip,
  type Composition,
  type Op,
  type Track,
} from "@lumacut/schema";
import { newEffectInstance } from "../inspector/effect-ops.ts";
import { addLayerOps } from "../photo/layers.ts";

/** What a filter layer carries: one built-in look, or one effect. */
export type FilterContent = { lookId: string; intensity?: number } | { effectId: string };

/** Where a new filter layer goes and how long it lasts. */
export interface FilterPlacement {
  /** A photo: the layer covers the single frame (`defaultUs` long, from 0). */
  photo: boolean;
  /** The selection: the layer goes directly above it and, in a video, spans it. */
  selectedClipIds: readonly string[];
  playheadUs: number;
  /** A photo's frame, or a video layer's length when nothing is selected. */
  defaultUs: number;
}

/** Ids for the new layer's track, clip and (for an effect) effect instance. */
export interface FilterLayerIds {
  trackId: string;
  clipId: string;
  effectId: string;
}

/** Effects that only work on the clip itself (keying, shadows, outlines…), not on a layer. */
export const effectAppliesToClip = (effectId: string): boolean =>
  effectById(effectId)?.appliesTo === "clip";

/** "Look: Noir" or the effect's name. */
export function filterName(filter: FilterContent): string {
  if ("lookId" in filter) {
    const info = BUILTIN_LUTS.find((l) => l.id === filter.lookId);
    return info === undefined ? "Look" : `Look: ${info.name}`;
  }
  return effectById(filter.effectId)?.name ?? "Effect";
}

/**
 * Ops that add one filter (a look or an effect) as its own adjustment layer: a new track directly
 * above the topmost selected clip (on top when nothing is selected) holding one adjustment clip.
 * In a video the clip spans the selected clips (or `defaultUs` from the playhead); in a photo it
 * covers the frame.
 */
export function filterLayerOps(
  comp: Composition,
  filter: FilterContent,
  placement: FilterPlacement,
  ids: FilterLayerIds,
): Op[] {
  const wanted = new Set(placement.selectedClipIds);
  const selected: { clip: Clip; index: number }[] = comp.tracks.flatMap(
    (track: Track, index: number) =>
      track.kind === "visual"
        ? track.clips.filter((c) => wanted.has(c.id)).map((clip) => ({ clip, index }))
        : [],
  );
  const index =
    selected.length === 0 ? comp.tracks.length : Math.max(...selected.map((s) => s.index)) + 1;

  let startUs = 0;
  let lengthUs = placement.defaultUs;
  if (!placement.photo) {
    if (selected.length === 0) {
      startUs = placement.playheadUs;
    } else {
      startUs = Math.min(...selected.map((s) => s.clip.startUs));
      const endUs = Math.max(...selected.map((s) => s.clip.startUs + lengthOf(s.clip)));
      lengthUs = Math.max(1, endUs - startUs);
    }
  }

  const clip = createClip({
    id: ids.clipId,
    type: "adjustment",
    startUs,
    inUs: 0,
    outUs: lengthUs,
    ...("lookId" in filter
      ? {
          color: {
            ...neutralColor(),
            lut: { lutId: filter.lookId, intensity: filter.intensity ?? 1 },
          },
        }
      : { effects: [newEffectInstance(filter.effectId, ids.effectId)] }),
  });
  return addLayerOps(comp, clip, ids.trackId, filterName(filter), index);
}

/**
 * A filter layer: a track holding one adjustment clip that carries exactly one look or exactly one
 * effect (what `filterLayerOps` makes). Returns that clip, or undefined for any other track.
 */
export function filterLayerClip(track: Track): Clip | undefined {
  if (track.kind !== "visual" || track.clips.length !== 1) return undefined;
  const clip = track.clips[0];
  if (clip?.type !== "adjustment") return undefined;
  const look = clip.color.lut !== undefined;
  const effects = clip.effects.length;
  return (look && effects === 0) || (!look && effects === 1) ? clip : undefined;
}
