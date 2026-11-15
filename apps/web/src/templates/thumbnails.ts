import { Engine } from "@lumacut/engine";
import type { Project } from "@lumacut/schema";
import { createApiAssetResolver } from "../engine/resolver.ts";

const cache = new Map<string, Promise<string>>();
let engine: Engine | null = null;
let canvas: OffscreenCanvas | null = null;
let queue: Promise<unknown> = Promise.resolve();

/**
 * A picture of a project, drawn by the engine and cached by `key` for the session. `build` makes
 * the project only when the picture is actually needed; `atUs` is the moment to draw (default: a
 * third of the way in). One engine draws every thumbnail, one at a time, so galleries never hold
 * more than one WebGL context between them.
 */
export function projectThumbnail(
  key: string,
  build: () => Project,
  width = 360,
  atUs?: number,
): Promise<string> {
  let pending = cache.get(key);
  if (pending === undefined) {
    const run = queue.then(() => draw(build(), width, atUs));
    queue = run.catch(() => undefined);
    pending = run;
    cache.set(key, pending);
    pending.catch(() => {
      cache.delete(key);
    });
  }
  return pending;
}

/** A picture of a template at a third of its length (media slots show as their grey stand-ins). */
export function templateThumbnail(key: string, project: Project, width = 360): Promise<string> {
  return projectThumbnail(key, () => project, width);
}

async function draw(project: Project, width: number, atUs?: number): Promise<string> {
  canvas ??= new OffscreenCanvas(1, 1);
  engine ??= Engine.create({ canvas, resolver: createApiAssetResolver() });
  const comp = project.compositions.find((c) => c.id === project.mainCompositionId);
  if (comp === undefined) throw new Error("The project has no main composition.");
  const scale = Math.min(1, width / comp.width);
  engine.setProject(project);
  engine.setView({ x: 0, y: 0, width: comp.width, height: comp.height, scale });
  await engine.renderAt(comp.id, atUs ?? Math.round(comp.durationUs / 3));
  const blob = await canvas.convertToBlob({ type: "image/webp", quality: 0.8 });
  return URL.createObjectURL(blob);
}
