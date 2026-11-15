import { endOf } from "@lumacut/ops";
import type { Composition, Op, Track } from "@lumacut/schema";

/** The main track of Simple mode: the bottom picture track. */
export function mainTrack(comp: Composition): Track | undefined {
  return comp.tracks.find((t) => t.kind === "visual");
}

/**
 * Ops that close the gaps on the main track: its clips, in time order, butt up against each other
 * from 0. Each clip only moves left, onto time the earlier clips have already left free, so no
 * step overlaps another clip. Empty when the track is already packed.
 */
export function packMainTrackOps(comp: Composition): Op[] {
  const track = mainTrack(comp);
  if (track === undefined || track.locked) return [];
  const clips = [...track.clips].sort((a, b) => a.startUs - b.startUs);
  const ops: Op[] = [];
  let cursor = 0;
  for (const clip of clips) {
    if (clip.startUs !== cursor) {
      ops.push({ type: "moveClip", clipId: clip.id, trackId: track.id, startUs: cursor });
    }
    cursor += endOf(clip) - clip.startUs;
  }
  return ops;
}
