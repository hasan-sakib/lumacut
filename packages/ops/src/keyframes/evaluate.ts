import type { Clip, KeyframeValue } from "@lumacut/schema";
import { resolveProperty } from "./paths.ts";
import { evaluateFrames } from "./segment.ts";

/**
 * The value of `path` on `clip` at `localUs`, microseconds from the clip's start (keyframes are
 * clip-local). Animated properties are evaluated; others return their static value; a path that
 * isn't an animatable property of the clip gives undefined.
 */
export function evaluate(clip: Clip, path: string, localUs: number): KeyframeValue | undefined {
  const property = resolveProperty(clip, path);
  if (property === undefined) return undefined;
  const frames = clip.keyframes[path];
  if (frames === undefined || frames.length === 0) return property.get(clip);
  return evaluateFrames(frames, localUs) ?? property.get(clip);
}

/** Clip-local time of a timeline time (can be negative or past the end; evaluation clamps). */
export const localTime = (clip: Clip, timelineUs: number): number => timelineUs - clip.startUs;

/**
 * The clip with every animated property replaced by its value at `localUs`: what the engine draws
 * and the inspector shows. Paths that no longer resolve (e.g. a removed effect) are ignored.
 */
export function animatedClip(clip: Clip, localUs: number): Clip {
  let result = clip;
  for (const [path, frames] of Object.entries(clip.keyframes)) {
    if (frames.length === 0) continue;
    const property = resolveProperty(result, path);
    if (property === undefined) continue;
    const value = evaluateFrames(frames, localUs);
    if (value !== undefined) result = property.set(result, value);
  }
  return result;
}

/** True when the clip has any keyframes at all (lets callers skip evaluation). */
export const isAnimated = (clip: Clip): boolean =>
  Object.values(clip.keyframes).some((frames) => frames.length > 0);
