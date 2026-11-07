import type { Clip, ClipPatch, ClipUnsettable, Op, Project, Track } from "@lumacut/schema";
import { deepEqual } from "./model.ts";

export interface DiffOps {
  removes: Op[];
  moves: Op[];
  props: Op[];
  adds: Op[];
}

/** What `setProps` must do to turn `after` back into `before` (null when nothing differs). */
function propsDiff(
  before: Clip,
  after: Clip,
): { props: ClipPatch; unset: ClipUnsettable[] } | null {
  const left = before as unknown as Record<string, unknown>;
  const right = after as unknown as Record<string, unknown>;
  const props: Record<string, unknown> = {};
  const unset: ClipUnsettable[] = [];
  for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
    if (key === "id" || key === "type") continue;
    if (deepEqual(left[key], right[key])) continue;
    if (left[key] === undefined) unset.push(key as ClipUnsettable);
    else props[key] = left[key];
  }
  return Object.keys(props).length === 0 && unset.length === 0 ? null : { props: props, unset };
}

/**
 * The ops that turn `after` back into `before`, for every composition present in both. Only
 * tracks whose object changed are looked at (ops keep untouched parts shared). Track structure
 * (adding, removing, reordering tracks) isn't diffed: those ops have their own inverses.
 * The parts are returned separately because callers sometimes need to slip an op between them.
 */
export function diffOps(before: Project, after: Project): DiffOps {
  const out: DiffOps = { removes: [], moves: [], props: [], adds: [] };
  const beforeComps = new Map(before.compositions.map((c) => [c.id, c]));
  for (const afterComp of after.compositions) {
    const beforeComp = beforeComps.get(afterComp.id);
    if (beforeComp === undefined || beforeComp === afterComp) continue;
    const beforeTracks = new Map<string, Track>(beforeComp.tracks.map((t) => [t.id, t]));
    const clipsBefore = new Map<string, { trackId: string; clip: Clip }>();
    const clipsAfter = new Map<string, { trackId: string; clip: Clip }>();
    for (const track of afterComp.tracks) {
      const previous = beforeTracks.get(track.id);
      if (previous === undefined || previous === track) continue;
      for (const clip of previous.clips) clipsBefore.set(clip.id, { trackId: track.id, clip });
      for (const clip of track.clips) clipsAfter.set(clip.id, { trackId: track.id, clip });
    }
    for (const id of clipsAfter.keys()) {
      if (!clipsBefore.has(id)) out.removes.push({ type: "removeClip", clipId: id });
    }
    for (const [id, prev] of clipsBefore) {
      const next = clipsAfter.get(id);
      if (next === undefined) {
        out.adds.push({ type: "addClip", trackId: prev.trackId, clip: prev.clip });
        continue;
      }
      if (prev.trackId !== next.trackId) {
        out.moves.push({
          type: "moveClip",
          clipId: id,
          trackId: prev.trackId,
          startUs: prev.clip.startUs,
        });
      }
      const d = propsDiff(prev.clip, next.clip);
      if (d !== null) {
        out.props.push({
          type: "setProps",
          clipId: id,
          props: d.props,
          ...(d.unset.length > 0 ? { unset: d.unset } : {}),
        });
      }
    }
  }
  return out;
}

/** The inverse of a clip-level edit that turned `before` into `after`: always one batch. */
export function inverseByDiff(before: Project, after: Project, label?: string): Op {
  const d = diffOps(before, after);
  return {
    type: "batch",
    ...(label === undefined ? {} : { label }),
    ops: [...d.removes, ...d.moves, ...d.props, ...d.adds],
  };
}
