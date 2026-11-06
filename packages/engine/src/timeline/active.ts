import type { Clip, Composition } from "@lumacut/schema";
import { isClipActive } from "./source-time.ts";

export interface ActiveClip {
  clip: Clip;
  trackId: string;
  /** Position in `composition.tracks` (0 = bottom). */
  trackIndex: number;
  clipIndex: number;
}

/**
 * Clips to draw at `tUs`, bottom to top: visual tracks in array order (tracks[0] is the bottom),
 * clips in array order within a track. Hidden tracks are skipped. `solo` and `muted` only affect
 * audio.
 */
export function activeVisualClips(composition: Composition, tUs: number): ActiveClip[] {
  const out: ActiveClip[] = [];
  composition.tracks.forEach((track, trackIndex) => {
    if (track.kind !== "visual" || track.hidden) return;
    track.clips.forEach((clip, clipIndex) => {
      if (isClipActive(clip, tUs)) out.push({ clip, trackId: track.id, trackIndex, clipIndex });
    });
  });
  return out;
}
