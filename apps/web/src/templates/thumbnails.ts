import { Engine } from "@lumacut/engine";
import type { Project } from "@lumacut/schema";
import { createApiAssetResolver } from "../engine/resolver.ts";

const cache = new Map<string, Promise<string>>();
let engine: Engine | null = null;
let canvas: OffscreenCanvas | null = null;
let queue: Promise<unknown> = Promise.resolve();

/**
 * A picture of a template, drawn by the engine at a third of its length (media slots show as
 * their grey stand-ins) and cached by `key` for the session. One engine draws every thumbnail, one
 * at a time, so a gallery never holds more than one WebGL context.
 */
export function templateThumbnail(key: string, project: Project, width = 360): Promise<string> {
  let pending = cache.get(key);
  if (pending === undefined) {
    const run = queue.then(() => draw(project, width));
    queue = run.catch(() => undefined);
    pending = run;
    cache.set(key, pending);
    pending.catch(() => {
      cache.delete(key);
    });
  }
  return pending;
}

async function draw(project: Project, width: number): Promise<string> {
  canvas ??= new OffscreenCanvas(1, 1);
  engine ??= Engine.create({ canvas, resolver: createApiAssetResolver() });
  const comp = project.compositions.find((c) => c.id === project.mainCompositionId);
  if (comp === undefined) throw new Error("The template has no main composition.");
  const scale = Math.min(1, width / comp.width);
  engine.setProject(project);
  engine.setView({ x: 0, y: 0, width: comp.width, height: comp.height, scale });
  await engine.renderAt(comp.id, Math.round(comp.durationUs / 3));
  const blob = await canvas.convertToBlob({ type: "image/webp", quality: 0.8 });
  return URL.createObjectURL(blob);
}
