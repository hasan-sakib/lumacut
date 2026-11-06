import type { Clip, Project } from "@lumacut/schema";
import { assertUnlocked, mapClip, needClip } from "./model.ts";

/** A clip-level edit: the new project and the compositions whose clips changed. */
export interface Edit {
  project: Project;
  touched: string[];
}

/** Applies `fn` to one clip (its track must be unlocked). */
export function editClipData(project: Project, clipId: string, fn: (clip: Clip) => Clip): Edit {
  const ref = needClip(project, clipId);
  assertUnlocked(ref.track);
  return { project: mapClip(project, ref, fn), touched: [ref.composition.id] };
}
