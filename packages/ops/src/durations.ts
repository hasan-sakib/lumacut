import type { Op, Project } from "@lumacut/schema";
import { endOf } from "./model.ts";

/** End of the last clip in the composition, or 0 when it has none. */
export function contentEndUs(project: Project, compositionId: string): number {
  const composition = project.compositions.find((c) => c.id === compositionId);
  if (composition === undefined) return 0;
  let end = 0;
  for (const track of composition.tracks) for (const clip of track.clips) end = Math.max(end, endOf(clip));
  return end;
}

/**
 * The `updateComposition` ops that make every composition exactly as long as its content (the
 * end of its last clip). A project's duration therefore follows its edits. Photo projects have a
 * single frame and keep `durationUs = 0`. The caller adds these to the edit's own batch, so the
 * change and its duration are one undo step.
 */
export function durationOps(project: Project): Op[] {
  if (project.kind === "photo") return [];
  const ops: Op[] = [];
  for (const composition of project.compositions) {
    const end = contentEndUs(project, composition.id);
    if (end !== composition.durationUs) {
      ops.push({ type: "updateComposition", compositionId: composition.id, props: { durationUs: end } });
    }
  }
  return ops;
}
