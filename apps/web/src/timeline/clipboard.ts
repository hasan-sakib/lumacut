import { endOf } from "@lumacut/ops";
import {
  createTrack,
  type Clip,
  type ClipPatch,
  type Composition,
  type Op,
  type Track,
  type TrackKind,
} from "@lumacut/schema";
import { placedClips } from "./clips.ts";
import { must } from "../lib/must.ts";

/** Copied clips with where they came from, so a paste can keep their relative layout. */
export interface ClipboardData {
  clips: { clip: Clip; trackId: string; kind: TrackKind }[];
  /** Earliest start among the copied clips: pasting at time T puts that clip at T. */
  originUs: number;
}

/** Copy these clips (null when none of the ids exist). The clips are cloned: later edits don't change the clipboard. */
export function copyClips(comp: Composition, clipIds: readonly string[]): ClipboardData | null {
  const wanted = new Set(clipIds);
  const picked = placedClips(comp).filter((p) => wanted.has(p.clip.id));
  if (picked.length === 0) return null;
  return {
    clips: picked.map((p) => ({
      clip: structuredClone(p.clip),
      trackId: p.track.id,
      kind: p.track.kind,
    })),
    originUs: Math.min(...picked.map((p) => p.clip.startUs)),
  };
}

const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number): boolean =>
  aStart < bEnd && bStart < aEnd;

/**
 * The ops that paste the clipboard with its first clip at `atUs`.
 * - Every pasted clip gets a new id; link groups that were copied whole are re-linked among the
 *   copies (a new group), and a clip whose partner wasn't copied is pasted unlinked.
 * - A transition is kept only when the clip before it was copied too.
 * - Each clip goes back to its own track if that track still exists, isn't locked and is free
 *   there; otherwise to another free unlocked track of the same kind; otherwise a new track.
 */
export function pasteOps(
  comp: Composition,
  data: ClipboardData,
  atUs: number,
  newId: () => string,
): Op[] {
  const shift = atUs - data.originUs;
  const copiedIds = new Set(data.clips.map((c) => c.clip.id));
  const linkMembers = new Map<string, string[]>();
  for (const { clip } of data.clips)
    if (clip.linkId !== undefined)
      linkMembers.set(clip.linkId, [...(linkMembers.get(clip.linkId) ?? []), clip.id]);
  const newLinkIds = new Map<string, string>();
  for (const [link, members] of linkMembers) if (members.length >= 2) newLinkIds.set(link, newId());

  // Spans already taken on each track: what is there, plus what this paste has placed.
  const taken = new Map<string, { start: number; end: number }[]>(
    comp.tracks.map((t) => [t.id, t.clips.map((c) => ({ start: c.startUs, end: endOf(c) }))]),
  );
  const created: Track[] = [];
  const ops: Op[] = [];
  const free = (trackId: string, start: number, end: number): boolean =>
    !(taken.get(trackId) ?? []).some((s) => overlaps(start, end, s.start, s.end));

  for (const entry of data.clips) {
    const { clip } = entry;
    const start = clip.startUs + shift;
    const end = start + (endOf(clip) - clip.startUs);
    const usable = (t: Track) => t.kind === entry.kind && !t.locked && free(t.id, start, end);
    const home = comp.tracks.find((t) => t.id === entry.trackId);
    let target: string | undefined =
      home !== undefined && usable(home) ? home.id : comp.tracks.find(usable)?.id;
    target ??= created.find((t) => t.kind === entry.kind && free(t.id, start, end))?.id;
    if (target === undefined) {
      const track = createTrack({
        id: newId(),
        kind: entry.kind,
        name: `${entry.kind === "visual" ? "Video" : "Audio"} ${String(comp.tracks.length + created.length + 1)}`,
      });
      created.push(track);
      taken.set(track.id, []);
      ops.push({
        type: "addTrack",
        compositionId: comp.id,
        track,
        index: comp.tracks.length + created.length - 1,
      });
      target = track.id;
    }

    const copy: Clip = structuredClone(clip);
    copy.id = newId();
    copy.startUs = start;
    delete copy.linkId;
    if (clip.linkId !== undefined && newLinkIds.has(clip.linkId))
      copy.linkId = must(newLinkIds.get(clip.linkId));
    const previous = data.clips.find(
      (c) =>
        c.trackId === entry.trackId && copiedIds.has(c.clip.id) && endOf(c.clip) === clip.startUs,
    );
    if (previous === undefined) delete copy.transitionIn;
    taken.set(target, [...(taken.get(target) ?? []), { start, end }]);
    ops.push({ type: "addClip", trackId: target, clip: copy });
  }
  return ops;
}

// --- Attributes -------------------------------------------------------------------------------

const PICTURE_KEYS = [
  "transform",
  "opacity",
  "blendMode",
  "crop",
  "color",
  "effects",
  "motionBlur",
] as const;
const AUDIO_KEYS = ["audio"] as const;

/** The look of a clip, ready to paste onto others. Which part applies depends on the target's track kind. */
export interface Attributes {
  picture: ClipPatch;
  audio: ClipPatch;
}

/** `kind` is the kind of track the clip is on: an audio clip has no picture look to copy, and vice versa. */
export function copyAttributes(clip: Clip, kind: TrackKind): Attributes {
  const pick = (keys: readonly (keyof Clip)[]): ClipPatch => {
    const out: Record<string, unknown> = {};
    for (const key of keys) if (clip[key] !== undefined) out[key] = structuredClone(clip[key]);
    return out;
  };
  return {
    picture: kind === "visual" ? pick(PICTURE_KEYS) : {},
    audio: kind === "audio" ? pick(AUDIO_KEYS) : {},
  };
}

/** One `setProps` per target: picture attributes for picture clips, audio attributes for audio clips. */
export function pasteAttributesOps(
  comp: Composition,
  attrs: Attributes,
  targetIds: readonly string[],
): Op[] {
  const wanted = new Set(targetIds);
  const ops: Op[] = [];
  for (const { clip, track } of placedClips(comp)) {
    if (!wanted.has(clip.id)) continue;
    const props = track.kind === "audio" ? attrs.audio : attrs.picture;
    if (Object.keys(props).length === 0) continue;
    ops.push({ type: "setProps", clipId: clip.id, props: structuredClone(props) });
  }
  return ops;
}
