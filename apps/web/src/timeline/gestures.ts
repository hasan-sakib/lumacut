import { applyOp, endOf, OpError, type OpErrorCode } from "@lumacut/ops";
import type { Composition, Op, Project, Rational } from "@lumacut/schema";
import { containsStrictly, findPlaced, splitOps, withLinked } from "./clips.ts";
import { roundToFrame } from "./geometry.ts";
import { snap, snapSpan } from "./snapping.ts";

/** Everything a gesture needs to know about the timeline, with no DOM in sight. */
export interface GestureEnv {
  composition: Composition;
  /** Times to snap to (see `snapExclusions` for which clips to leave out). */
  snapPoints: readonly number[];
  /** How close counts as "on" a snap point, in µs (a few pixels at the current zoom). */
  thresholdUs: number;
  snapping: boolean;
  fps: Rational;
  newId: () => string;
}

export interface GestureResult {
  op: Op;
  /** The snap point the gesture landed on, for drawing the snap line; null when free. */
  snappedTo: number | null;
}

export type GestureKind = "move" | "trim" | "roll" | "slip" | "slide" | "razor";

/** The clips whose own edges must not attract the gesture (the ones being dragged). */
export function snapExclusions(
  comp: Composition,
  kind: GestureKind,
  clipId: string,
  selectedIds: readonly string[],
): string[] {
  return kind === "move" ? withLinked(comp, [...new Set([...selectedIds, clipId])]) : [clipId];
}

/** Snap a single time if snapping is on, otherwise (or when nothing is close) land on a frame. */
function place(env: GestureEnv, tUs: number): { tUs: number; snappedTo: number | null } {
  if (env.snapping) {
    const s = snap(tUs, env.snapPoints, env.thresholdUs);
    if (s.to !== null) return { tUs: s.tUs, snappedTo: s.to };
  }
  return { tUs: roundToFrame(tUs, env.fps), snappedTo: null };
}

const one = (ops: Op[], label: string): Op =>
  ops.length === 1 && ops[0] !== undefined ? ops[0] : { type: "batch", label, ops };

// --- Move -------------------------------------------------------------------------------------

export interface MoveInput {
  clipId: string;
  /** Clips selected along with the grabbed one (they keep their positions relative to it). */
  selectedIds: readonly string[];
  /** Pointer movement in µs since the drag began. */
  deltaUs: number;
  /** The lane the pointer is over; honoured only for a lane of the same kind as the grabbed clip's. */
  targetTrackId?: string | undefined;
}

/** Drag a clip (and the selection, and everything linked to them) sideways, and the grabbed clip to another lane. */
export function moveGesture(env: GestureEnv, input: MoveInput): GestureResult | null {
  const comp = env.composition;
  const grabbed = findPlaced(comp, input.clipId);
  if (grabbed === undefined) return null;
  const moving = withLinked(comp, [...new Set([...input.selectedIds, input.clipId])]).flatMap(
    (id) => {
      const p = findPlaced(comp, id);
      return p === undefined ? [] : [p];
    },
  );
  const minStart = Math.min(...moving.map((m) => m.clip.startUs));
  const length = endOf(grabbed.clip) - grabbed.clip.startUs;

  let delta = Math.max(input.deltaUs, -minStart);
  let snappedTo: number | null = null;
  if (env.snapping) {
    const s = snapSpan(
      grabbed.clip.startUs + delta,
      grabbed.clip.startUs + delta + length,
      env.snapPoints,
      env.thresholdUs,
    );
    if (s.to !== null) {
      delta += s.deltaUs;
      snappedTo = s.to;
    }
  }
  if (snappedTo === null)
    delta = roundToFrame(grabbed.clip.startUs + delta, env.fps) - grabbed.clip.startUs;
  delta = Math.max(delta, -minStart);

  const lane = comp.tracks.find(
    (t) => t.id === input.targetTrackId && t.kind === grabbed.track.kind,
  );
  const destination = lane?.id ?? grabbed.track.id;
  if (delta === 0 && destination === grabbed.track.id) return null;

  const ops = moving.map((m): Op => ({
    type: "moveClip",
    clipId: m.clip.id,
    trackId: m.clip.id === input.clipId ? destination : m.track.id,
    startUs: m.clip.startUs + delta,
  }));
  return { op: one(ops, "Move clips"), snappedTo };
}

// --- Trim, ripple, roll -----------------------------------------------------------------------

export interface TrimInput {
  clipId: string;
  edge: "start" | "end";
  /** Where the pointer put the edge, in timeline µs. */
  toUs: number;
  /** Ripple tool: later clips on the track follow. */
  ripple: boolean;
  /**
   * Clips selected with the grabbed one. Those linked to it are trimmed by the same amount, so a
   * picture and its sound stay in step; Alt-clicking a clip leaves its partner out of the selection.
   */
  selectedIds?: readonly string[];
}

export function trimGesture(env: GestureEnv, input: TrimInput): GestureResult | null {
  const placed = findPlaced(env.composition, input.clipId);
  if (placed === undefined) return null;
  const { tUs, snappedTo } = place(env, input.toUs);
  const current = input.edge === "start" ? placed.clip.startUs : endOf(placed.clip);
  if (tUs === current) return null;
  const delta = tUs - current;
  const trim = (clipId: string, toUs: number): Op => ({
    type: input.ripple ? "rippleTrim" : "trimClip",
    clipId,
    edge: input.edge,
    toUs,
  });
  const partners = (input.selectedIds ?? []).flatMap((id) => {
    const other = findPlaced(env.composition, id);
    const linked =
      other !== undefined &&
      other.clip.id !== input.clipId &&
      placed.clip.linkId !== undefined &&
      other.clip.linkId === placed.clip.linkId;
    return linked ? [other] : [];
  });
  const ops = [
    trim(input.clipId, tUs),
    ...partners.map((p) =>
      trim(
        p.clip.id,
        Math.max(0, (input.edge === "start" ? p.clip.startUs : endOf(p.clip)) + delta),
      ),
    ),
  ];
  return { op: one(ops, "Trim clips"), snappedTo };
}

export interface RollInput {
  leftClipId: string;
  rightClipId: string;
  toUs: number;
}

/** Move the cut between two adjacent clips. */
export function rollGesture(env: GestureEnv, input: RollInput): GestureResult | null {
  const left = findPlaced(env.composition, input.leftClipId);
  if (left === undefined) return null;
  const { tUs, snappedTo } = place(env, input.toUs);
  if (tUs === endOf(left.clip)) return null;
  return {
    op: {
      type: "rollEdit",
      leftClipId: input.leftClipId,
      rightClipId: input.rightClipId,
      toUs: tUs,
    },
    snappedTo,
  };
}

// --- Slip and slide ---------------------------------------------------------------------------

export interface DeltaInput {
  clipId: string;
  /** Pointer movement in timeline µs since the drag began. */
  deltaUs: number;
}

/**
 * Slip: the clip keeps its place and length, its content slides under it. Dragging right shows
 * earlier media (the picture follows the pointer), so the source window moves the other way; a
 * reversed clip plays its source backwards, so it moves the same way. The op's delta is source µs.
 */
export function slipGesture(env: GestureEnv, input: DeltaInput): GestureResult | null {
  const placed = findPlaced(env.composition, input.clipId);
  if (placed === undefined) return null;
  const { speed, reversed } = placed.clip;
  const source = Math.round(input.deltaUs * speed) * (reversed ? 1 : -1);
  if (source === 0) return null;
  return { op: { type: "slipClip", clipId: input.clipId, deltaUs: source }, snappedTo: null };
}

/** Slide: the clip moves and its neighbours' facing edges give way. */
export function slideGesture(env: GestureEnv, input: DeltaInput): GestureResult | null {
  const placed = findPlaced(env.composition, input.clipId);
  if (placed === undefined) return null;
  const start = placed.clip.startUs;
  const length = endOf(placed.clip) - start;
  let delta = Math.max(input.deltaUs, -start);
  let snappedTo: number | null = null;
  if (env.snapping) {
    const s = snapSpan(start + delta, start + delta + length, env.snapPoints, env.thresholdUs);
    if (s.to !== null) {
      delta += s.deltaUs;
      snappedTo = s.to;
    }
  }
  if (snappedTo === null) delta = roundToFrame(start + delta, env.fps) - start;
  delta = Math.max(delta, -start);
  return delta === 0
    ? null
    : { op: { type: "slideClip", clipId: input.clipId, deltaUs: delta }, snappedTo };
}

// --- Razor ------------------------------------------------------------------------------------

export interface RazorInput {
  clipId: string;
  atUs: number;
}

/** Cut the clicked clip (and the clips linked to it) at the clicked time. */
export function razorGesture(env: GestureEnv, input: RazorInput): GestureResult | null {
  const comp = env.composition;
  const { tUs, snappedTo } = place(env, input.atUs);
  const targets = withLinked(comp, [input.clipId]).flatMap((id) => {
    const p = findPlaced(comp, id);
    return p !== undefined && !p.track.locked && containsStrictly(p.clip, tUs) ? [p.clip] : [];
  });
  if (targets.length === 0) return null;
  return { op: one(splitOps(targets, tUs, env.newId), "Split clips"), snappedTo };
}

// --- Preview ----------------------------------------------------------------------------------

export type Preview =
  | { project: Project; error: null }
  | { project: null; error: { code: OpErrorCode; message: string } };

/**
 * What the project would look like after the gesture, or why it would be refused. The timeline
 * draws this while dragging, and dispatches the very same op on release.
 */
export function previewGesture(project: Project, op: Op): Preview {
  try {
    return { project: applyOp(project, op).project, error: null };
  } catch (error) {
    if (error instanceof OpError)
      return { project: null, error: { code: error.code, message: error.message } };
    throw error;
  }
}
