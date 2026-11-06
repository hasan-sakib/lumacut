import type { Asset, Clip, Composition, Project, Track } from "@lumacut/schema";
import { fail } from "./errors.ts";
import { allClips, endOf, lengthOf } from "./model.ts";

/** The first reference cycle between compositions, as a path of ids, or null. */
export function findCompositionCycle(project: Project): string[] | null {
  const refs = new Map<string, string[]>(
    project.compositions.map((c) => [
      c.id,
      c.tracks.flatMap((t) =>
        t.clips.flatMap((clip) => (clip.compositionId === undefined ? [] : [clip.compositionId])),
      ),
    ]),
  );
  const done = new Set<string>();
  const visit = (id: string, path: string[]): string[] | null => {
    const at = path.indexOf(id);
    if (at >= 0) return [...path.slice(at), id];
    if (done.has(id)) return null;
    for (const next of refs.get(id) ?? []) {
      const cycle = visit(next, [...path, id]);
      if (cycle !== null) return cycle;
    }
    done.add(id);
    return null;
  };
  for (const id of refs.keys()) {
    const cycle = visit(id, []);
    if (cycle !== null) return cycle;
  }
  return null;
}

function sourceDuration(asset: Asset): number | undefined {
  return asset.video?.durationUs ?? asset.audio?.durationUs;
}

function checkClip(clip: Clip, track: Track, project: Project): void {
  lengthOf(clip);
  if (clip.startUs < 0 || !Number.isSafeInteger(clip.startUs)) {
    fail("invalid_time", `Clip ${clip.id} starts at ${String(clip.startUs)}; start times are whole microseconds from 0.`);
  }
  if (clip.type === "media") {
    const asset = project.assets.find((a) => a.id === clip.assetId);
    if (clip.assetId === undefined || asset === undefined) {
      fail("unknown_asset", `Clip ${clip.id} uses asset "${String(clip.assetId)}", which isn't in the project.`);
    }
    if (track.kind === "audio" && asset.kind !== "video" && asset.kind !== "audio") {
      fail("wrong_track_kind", `An ${asset.kind} can't go on the audio track "${track.name}".`);
    }
    if (track.kind === "visual" && asset.kind === "audio") {
      fail("wrong_track_kind", `Audio can't go on the picture track "${track.name}".`);
    }
    const duration = sourceDuration(asset);
    if (duration !== undefined && clip.outUs > duration) {
      fail("trim_beyond_source", `Clip ${clip.id} ends ${String(clip.outUs - duration)} µs after the end of its media.`);
    }
  } else if (track.kind === "audio") {
    fail("wrong_track_kind", `A ${clip.type} clip can't go on the audio track "${track.name}".`);
  }
  if (clip.type === "composition") {
    if (clip.compositionId === undefined || !project.compositions.some((c) => c.id === clip.compositionId)) {
      fail("unknown_composition", `Clip ${clip.id} uses composition "${String(clip.compositionId)}", which doesn't exist.`);
    }
  }
}

/** Checks one composition (tracks already sorted by start time). */
export function validateComposition(project: Project, composition: Composition): void {
  for (const track of composition.tracks) {
    let previous: Clip | undefined;
    for (const clip of [...track.clips].sort((a, b) => a.startUs - b.startUs)) {
      checkClip(clip, track, project);
      if (previous !== undefined && endOf(previous) > clip.startUs) {
        fail("clips_overlap", `On track "${track.name}", clip ${previous.id} overlaps clip ${clip.id}.`);
      }
      previous = clip;
    }
  }
}

/** Checks everything an edit to `touched` compositions could have broken. */
export function validateTouched(project: Project, touched: ReadonlySet<string>): void {
  if (touched.size === 0) return;
  const seenClips = new Set<string>();
  for (const clip of allClips(project)) {
    if (seenClips.has(clip.id)) fail("duplicate_id", `Two clips share the id "${clip.id}".`);
    seenClips.add(clip.id);
  }
  const seenTracks = new Set<string>();
  for (const composition of project.compositions) {
    for (const track of composition.tracks) {
      if (seenTracks.has(track.id)) fail("duplicate_id", `Two tracks share the id "${track.id}".`);
      seenTracks.add(track.id);
    }
  }
  for (const composition of project.compositions) {
    if (touched.has(composition.id)) validateComposition(project, composition);
  }
  const cycle = findCompositionCycle(project);
  if (cycle !== null) {
    fail("composition_cycle", `Compositions can't contain themselves: ${cycle.join(" → ")}.`);
  }
}

/** Checks the whole project (e.g. after loading it from the server). */
export function validateProject(project: Project): void {
  validateTouched(project, new Set(project.compositions.map((c) => c.id)));
}
