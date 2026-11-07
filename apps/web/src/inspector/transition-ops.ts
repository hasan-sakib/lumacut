import { defaultParams, transitionById } from "@lumacut/effects";
import { endOf } from "@lumacut/ops";
import type { Clip, Op, TransitionAlignment, TransitionInstance, Track } from "@lumacut/schema";

export const US = 1_000_000;
export const DEFAULT_TRANSITION_US = US;

/** The clip immediately before `clip` on its track when it ends exactly where `clip` starts. */
export function touchingPrevious(track: Track, clip: Clip): Clip | undefined {
  const sorted = [...track.clips].sort((a, b) => a.startUs - b.startUs);
  const previous = sorted[sorted.findIndex((c) => c.id === clip.id) - 1];
  return previous !== undefined && endOf(previous) === clip.startUs ? previous : undefined;
}

/** The longest transition that fits at this cut with this alignment (what `setTransition` allows). */
export function maxTransitionUs(
  previous: Clip,
  clip: Clip,
  alignment: TransitionAlignment,
): number {
  const after = endOf(clip) - clip.startUs;
  const before = endOf(previous) - previous.startUs;
  if (alignment === "start") return after;
  if (alignment === "end") return Math.min(before, after);
  return Math.min(before, after) * 2;
}

export function newTransition(
  transitionId: string,
  id: string,
  durationUs: number,
  alignment: TransitionAlignment = "center",
): TransitionInstance {
  const def = transitionById(transitionId);
  return {
    id,
    transitionId,
    durationUs: Math.max(1, Math.round(durationUs)),
    alignment,
    params: def === undefined ? {} : defaultParams(def.params),
  };
}

/** `setTransition` for a clip, with the duration cut down to what fits the cut. Null without a touching previous clip. */
export function addTransitionOp(
  track: Track,
  clip: Clip,
  transitionId: string,
  newId: () => string,
  seconds?: number,
): Op | null {
  const previous = touchingPrevious(track, clip);
  if (previous === undefined) return null;
  const alignment: TransitionAlignment = "center";
  const wanted = Math.round((seconds ?? DEFAULT_TRANSITION_US / US) * US);
  const durationUs = Math.min(wanted, maxTransitionUs(previous, clip, alignment));
  if (durationUs < 1) return null;
  return {
    type: "setTransition",
    clipId: clip.id,
    transition: newTransition(transitionId, newId(), durationUs, alignment),
  };
}

export const removeTransitionOp = (clipId: string): Op => ({ type: "setTransition", clipId });

/** Replaces part of a clip's transition, keeping the rest (duration is cut down to fit). */
export function updateTransitionOp(
  track: Track,
  clip: Clip,
  change: Partial<Pick<TransitionInstance, "transitionId" | "durationUs" | "alignment">>,
): Op | null {
  const current = clip.transitionIn;
  const previous = touchingPrevious(track, clip);
  if (current === undefined || previous === undefined) return null;
  const next: TransitionInstance = { ...current, ...change };
  if (change.transitionId !== undefined && change.transitionId !== current.transitionId) {
    const def = transitionById(change.transitionId);
    next.params = def === undefined ? {} : defaultParams(def.params);
  }
  next.durationUs = Math.max(
    1,
    Math.min(Math.round(next.durationUs), maxTransitionUs(previous, clip, next.alignment)),
  );
  return { type: "setTransition", clipId: clip.id, transition: next };
}
