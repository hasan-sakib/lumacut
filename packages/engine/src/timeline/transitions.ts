import type { Clip, Composition, TransitionInstance } from "@lumacut/schema";
import { clipEndUs, isClipActive } from "./source-time.ts";

/** What to draw at one instant, bottom to top: a clip, or two clips blended by a transition. */
export type LayerPlanItem =
  | { type: "clip"; clip: Clip; trackIndex: number }
  | {
      type: "transition";
      from: Clip;
      to: Clip;
      transition: TransitionInstance;
      /** 0..1 through the transition window. */
      progress: number;
      trackIndex: number;
    };

export interface LayerPlan {
  items: LayerPlanItem[];
  /** Active clips that have a transition but no clip touching them on the left. */
  orphanTransitions: string[];
}

/** The instants a transition covers: [start, end) around the cut at the incoming clip's start. */
export function transitionWindow(
  to: Clip,
  transition: TransitionInstance,
): { start: number; end: number } {
  const cut = to.startUs;
  const d = transition.durationUs;
  const start =
    transition.alignment === "start"
      ? cut
      : transition.alignment === "end"
        ? cut - d
        : cut - Math.floor(d / 2);
  return { start, end: start + d };
}

/**
 * Plans the layers of a composition at `tUs`: visual tracks bottom to top (hidden ones skipped),
 * each clip drawn on its own, except where a transition covers the instant, in which case the clip
 * it blends from and the clip it blends into become one item. A transition needs the previous clip
 * on the track to end exactly where the incoming one starts; otherwise it is reported and ignored.
 */
export function planLayers(composition: Composition, tUs: number): LayerPlan {
  const items: LayerPlanItem[] = [];
  const orphanTransitions: string[] = [];
  composition.tracks.forEach((track, trackIndex) => {
    if (track.kind !== "visual" || track.hidden) return;
    const clips = [...track.clips].sort((a, b) => a.startUs - b.startUs);
    const consumed = new Set<string>();
    const transitions = new Map<string, LayerPlanItem>();
    clips.forEach((clip, i) => {
      const transition = clip.transitionIn;
      if (transition === undefined) return;
      const previous = clips[i - 1];
      const touching = previous !== undefined && clipEndUs(previous) === clip.startUs;
      if (!touching) {
        if (isClipActive(clip, tUs)) orphanTransitions.push(clip.id);
        return;
      }
      const { start, end } = transitionWindow(clip, transition);
      if (tUs < start || tUs >= end) return;
      consumed.add(previous.id);
      consumed.add(clip.id);
      transitions.set(clip.id, {
        type: "transition",
        from: previous,
        to: clip,
        transition,
        progress: (tUs - start) / transition.durationUs,
        trackIndex,
      });
    });
    // Keep the track's own clip order; a transition takes the place of the incoming clip.
    track.clips.forEach((clip) => {
      const blended = transitions.get(clip.id);
      if (blended !== undefined) items.push(blended);
      else if (!consumed.has(clip.id) && isClipActive(clip, tUs)) {
        items.push({ type: "clip", clip, trackIndex });
      }
    });
  });
  return { items, orphanTransitions };
}
