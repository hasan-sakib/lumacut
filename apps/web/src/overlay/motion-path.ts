import { evaluate } from "@lumacut/ops";
import type { Clip, Keyframe, Vec2 } from "@lumacut/schema";

export const POSITION_PATH = "transform.position";

/** The clip's position keyframes (sorted), or an empty list. */
export const positionKeys = (clip: Clip): readonly Keyframe[] =>
  clip.keyframes[POSITION_PATH] ?? [];

/** Points along the position animation in composition pixels: what the on-canvas motion path draws. */
export function samplePositionPath(clip: Clip, steps = 12): Vec2[] {
  const keys = positionKeys(clip);
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (first === undefined || last === undefined || keys.length < 2) return [];
  const points: Vec2[] = [];
  for (let i = 0; i + 1 < keys.length; i += 1) {
    const a = keys[i];
    const b = keys[i + 1];
    if (a === undefined || b === undefined) continue;
    for (let s = 0; s < steps; s += 1) {
      const t = a.tUs + ((b.tUs - a.tUs) * s) / steps;
      const v = evaluate(clip, POSITION_PATH, t);
      if (Array.isArray(v)) points.push([v[0], v[1]]);
    }
  }
  const end = evaluate(clip, POSITION_PATH, last.tUs);
  if (Array.isArray(end)) points.push([end[0], end[1]]);
  return points;
}

/** Position of a keyframe's value as a point (or null when it isn't one). */
export const keyPoint = (k: Keyframe): Vec2 | null =>
  Array.isArray(k.value) ? [k.value[0], k.value[1]] : null;

/**
 * Smooth tangents for keyframe `index` (like After Effects' "auto Bezier"): along the line between
 * the neighbouring keyframes, a third of the way to each. Ends get tangents towards their only
 * neighbour.
 */
export function autoTangents(
  keys: readonly Keyframe[],
  index: number,
): { in: Vec2; out: Vec2 } | null {
  const here = keys[index] === undefined ? null : keyPoint(keys[index]);
  if (here === null) return null;
  const before = keys[index - 1];
  const after = keys[index + 1];
  const prev = before === undefined ? null : keyPoint(before);
  const next = after === undefined ? null : keyPoint(after);
  const a = prev ?? here;
  const b = next ?? here;
  const dir: Vec2 = [(b[0] - a[0]) / 6, (b[1] - a[1]) / 6];
  return {
    in: prev === null ? [0, 0] : [-dir[0], -dir[1]],
    out: next === null ? [0, 0] : dir,
  };
}
