import {
  clipTimelineDurationUs,
  type Clip,
  type Composition,
  type Project,
  type Track,
} from "@lumacut/schema";
import { fail } from "./errors.ts";

/** Timeline length of a clip; refuses clips whose timing is unusable. */
export function lengthOf(clip: Clip): number {
  if (!(clip.speed > 0) || !Number.isFinite(clip.speed)) {
    fail("invalid_speed", `Clip ${clip.id} has speed ${String(clip.speed)}; it must be above 0.`);
  }
  if (!Number.isSafeInteger(clip.inUs) || !Number.isSafeInteger(clip.outUs) || clip.inUs < 0) {
    fail(
      "invalid_time",
      `Clip ${clip.id} has a source range that isn't whole non-negative microseconds.`,
    );
  }
  if (clip.outUs <= clip.inUs) {
    fail(
      "invalid_range",
      `Clip ${clip.id} must end after it starts in its source (in ${String(clip.inUs)}, out ${String(clip.outUs)}).`,
    );
  }
  const length = clipTimelineDurationUs(clip);
  if (length < 1) fail("invalid_range", `Clip ${clip.id} would be shorter than one microsecond.`);
  return length;
}

export const endOf = (clip: Clip): number => clip.startUs + lengthOf(clip);

export interface CompositionRef {
  composition: Composition;
  index: number;
}

export interface TrackRef {
  composition: Composition;
  compIndex: number;
  track: Track;
  trackIndex: number;
}

export interface ClipRef extends TrackRef {
  clip: Clip;
  clipIndex: number;
}

export function needComposition(project: Project, id: string): CompositionRef {
  const index = project.compositions.findIndex((c) => c.id === id);
  const composition = project.compositions[index];
  if (composition === undefined) fail("unknown_composition", `There is no composition "${id}".`);
  return { composition, index };
}

export function findTrack(project: Project, trackId: string): TrackRef | undefined {
  for (const [compIndex, composition] of project.compositions.entries()) {
    const trackIndex = composition.tracks.findIndex((t) => t.id === trackId);
    const track = composition.tracks[trackIndex];
    if (track !== undefined) return { composition, compIndex, track, trackIndex };
  }
  return undefined;
}

export function needTrack(project: Project, trackId: string): TrackRef {
  const found = findTrack(project, trackId);
  if (found === undefined) fail("unknown_track", `There is no track "${trackId}".`);
  return found;
}

export function findClip(project: Project, clipId: string): ClipRef | undefined {
  for (const [compIndex, composition] of project.compositions.entries()) {
    for (const [trackIndex, track] of composition.tracks.entries()) {
      const clipIndex = track.clips.findIndex((c) => c.id === clipId);
      const clip = track.clips[clipIndex];
      if (clip !== undefined) return { composition, compIndex, track, trackIndex, clip, clipIndex };
    }
  }
  return undefined;
}

export function needClip(project: Project, clipId: string): ClipRef {
  const found = findClip(project, clipId);
  if (found === undefined) fail("unknown_clip", `There is no clip "${clipId}".`);
  return found;
}

export function assertUnlocked(track: Track): void {
  if (track.locked)
    fail("track_locked", `Track "${track.name}" is locked. Unlock it to edit its clips.`);
}

export function setComposition(project: Project, index: number, composition: Composition): Project {
  return {
    ...project,
    compositions: project.compositions.map((c, i) => (i === index ? composition : c)),
  };
}

export function setTrack(
  project: Project,
  ref: { compIndex: number; trackIndex: number },
  track: Track,
): Project {
  const composition = project.compositions[ref.compIndex];
  if (composition === undefined) return project;
  return setComposition(project, ref.compIndex, {
    ...composition,
    tracks: composition.tracks.map((t, i) => (i === ref.trackIndex ? track : t)),
  });
}

/** Replaces the clip with `fn(clip)`. The caller has already checked the track isn't locked. */
export function mapClip(project: Project, ref: ClipRef, fn: (clip: Clip) => Clip): Project {
  return setTrack(project, ref, {
    ...ref.track,
    clips: ref.track.clips.map((c, i) => (i === ref.clipIndex ? fn(c) : c)),
  });
}

export function allClips(project: Project): Clip[] {
  return project.compositions.flatMap((c) => c.tracks.flatMap((t) => t.clips));
}

export function clone<T>(value: T): T {
  return structuredClone(value);
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left).filter((k) => left[k] !== undefined);
  const otherKeys = Object.keys(right).filter((k) => right[k] !== undefined);
  if (keys.length !== otherKeys.length) return false;
  return keys.every((k) => deepEqual(left[k], right[k]));
}

/** The track with its clips ordered by start time; the same object when already ordered. */
export function sortTrack(track: Track): Track {
  const ordered = track.clips.every(
    (c, i) => i === 0 || (track.clips[i - 1]?.startUs ?? 0) <= c.startUs,
  );
  if (ordered) return track;
  return { ...track, clips: [...track.clips].sort((a, b) => a.startUs - b.startUs) };
}
