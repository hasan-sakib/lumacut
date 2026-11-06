import { endOf } from "@lumacut/ops";
import type { Clip, Composition, Op, Track } from "@lumacut/schema";

/** A clip together with the track it is on. */
export interface Placed {
  clip: Clip;
  track: Track;
}

export function placedClips(comp: Composition): Placed[] {
  return comp.tracks.flatMap((track) => track.clips.map((clip) => ({ clip, track })));
}

export function findPlaced(comp: Composition, clipId: string): Placed | undefined {
  return placedClips(comp).find((p) => p.clip.id === clipId);
}

/** The ids plus every clip linked to one of them (a linked pair is edited as one). */
export function withLinked(comp: Composition, ids: readonly string[]): string[] {
  const all = placedClips(comp);
  const links = new Set(all.filter((p) => ids.includes(p.clip.id) && p.clip.linkId).map((p) => p.clip.linkId));
  const out = new Set(ids.filter((id) => all.some((p) => p.clip.id === id)));
  for (const p of all) if (p.clip.linkId !== undefined && links.has(p.clip.linkId)) out.add(p.clip.id);
  return [...out];
}

/** True when the clip's time span strictly contains `tUs` (cutting there makes two real clips). */
export const containsStrictly = (clip: Clip, tUs: number): boolean => clip.startUs < tUs && tUs < endOf(clip);

/**
 * The ops that cut these clips at `atUs`. The second halves of clips that were linked to each
 * other are linked to each other (a new group), so a linked video/audio pair stays a pair.
 */
export function splitOps(targets: readonly Clip[], atUs: number, newId: () => string): Op[] {
  const ops: Op[] = [];
  const secondHalves = new Map<string, string[]>();
  for (const clip of targets) {
    const newClipId = newId();
    ops.push({ type: "splitClip", clipId: clip.id, atUs, newClipId });
    if (clip.linkId !== undefined) {
      secondHalves.set(clip.linkId, [...(secondHalves.get(clip.linkId) ?? []), newClipId]);
    }
  }
  for (const members of secondHalves.values()) {
    if (members.length >= 2) ops.push({ type: "linkClips", clipIds: members, linkId: newId() });
  }
  return ops;
}
