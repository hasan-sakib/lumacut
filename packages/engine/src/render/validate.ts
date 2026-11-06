import type { Project } from "@lumacut/schema";

export const MAX_NESTING_DEPTH = 16;

export class CompositionCycleError extends Error {
  override name = "CompositionCycleError";
  readonly path: string[];

  constructor(path: string[]) {
    super(`Compositions contain themselves: ${path.join(" → ")}`);
    this.path = path;
  }
}

export class CompositionDepthError extends Error {
  override name = "CompositionDepthError";

  constructor(path: string[]) {
    super(
      `Compositions are nested more than ${String(MAX_NESTING_DEPTH)} levels deep: ` +
        path.join(" → "),
    );
  }
}

/** Throws if nested compositions form a cycle or nest deeper than MAX_NESTING_DEPTH. */
export function validateProject(project: Project): void {
  const byId = new Map(project.compositions.map((c) => [c.id, c]));
  const done = new Set<string>();

  const visit = (id: string, path: string[]): void => {
    const at = path.indexOf(id);
    if (at !== -1) throw new CompositionCycleError([...path.slice(at), id]);
    if (done.has(id)) return;
    const comp = byId.get(id);
    if (comp === undefined) return; // missing compositions are reported when rendered
    const next = [...path, id];
    if (next.length > MAX_NESTING_DEPTH) throw new CompositionDepthError(next);
    for (const track of comp.tracks) {
      for (const clip of track.clips) {
        if (clip.type === "composition" && clip.compositionId !== undefined) {
          visit(clip.compositionId, next);
        }
      }
    }
    done.add(id);
  };

  for (const comp of project.compositions) visit(comp.id, []);
}
