import { endOf } from "@lumacut/ops";
import type { Composition } from "@lumacut/schema";

export interface SnapPointOptions {
  /** Clips to leave out (the ones being dragged must not snap to themselves). */
  excludeClipIds?: Iterable<string>;
  playheadUs?: number;
  includeMarkers?: boolean;
}

/** Times worth snapping to: the start, the playhead, markers and every clip's start and end. Sorted, unique. */
export function snapPoints(comp: Composition, options: SnapPointOptions = {}): number[] {
  const exclude = new Set(options.excludeClipIds ?? []);
  const points = new Set<number>([0]);
  if (options.playheadUs !== undefined) points.add(options.playheadUs);
  if (options.includeMarkers !== false) for (const m of comp.markers) points.add(m.tUs);
  for (const track of comp.tracks) {
    for (const clip of track.clips) {
      if (exclude.has(clip.id)) continue;
      points.add(clip.startUs);
      points.add(endOf(clip));
    }
  }
  return [...points].sort((a, b) => a - b);
}

export interface SnapResult {
  tUs: number;
  /** The point snapped to, or null when nothing was within the threshold. */
  to: number | null;
}

/** The point nearest to `tUs` within `thresholdUs`, else `tUs` unchanged. */
export function snap(tUs: number, points: readonly number[], thresholdUs: number): SnapResult {
  let best: number | null = null;
  let bestDistance = Infinity;
  for (const p of points) {
    const d = Math.abs(p - tUs);
    if (d <= thresholdUs && d < bestDistance) {
      best = p;
      bestDistance = d;
    }
  }
  return best === null ? { tUs, to: null } : { tUs: best, to: best };
}

export interface SnapShift {
  /** How far to shift the span so that one of its edges lands on a point (0 when none is close). */
  deltaUs: number;
  to: number | null;
  edge: "start" | "end" | null;
}

/** Snaps a moving span [startUs, endUs): whichever edge is closer to a point wins. */
export function snapSpan(startUs: number, endUs: number, points: readonly number[], thresholdUs: number): SnapShift {
  const a = snap(startUs, points, thresholdUs);
  const b = snap(endUs, points, thresholdUs);
  if (a.to === null && b.to === null) return { deltaUs: 0, to: null, edge: null };
  const da = a.to === null ? Infinity : Math.abs(a.tUs - startUs);
  const db = b.to === null ? Infinity : Math.abs(b.tUs - endUs);
  return da <= db
    ? { deltaUs: a.tUs - startUs, to: a.to, edge: "start" }
    : { deltaUs: b.tUs - endUs, to: b.to, edge: "end" };
}
