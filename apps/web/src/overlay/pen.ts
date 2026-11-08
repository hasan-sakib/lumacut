import type { BezierPath, BezierVertex, Vec2 } from "@lumacut/schema";

/** A path being drawn with the pen: the vertices placed so far. */
export interface PenState {
  vertices: BezierVertex[];
  /** The last vertex's tangents are following the pointer (mouse is down after placing it). */
  dragging: boolean;
}

export const EMPTY_PEN: PenState = { vertices: [], dragging: false };

/**
 * A press places a vertex (a click makes a sharp corner; dragging pulls out its tangents).
 * Pressing close to the first vertex (within `closeRadius`, once there are three) closes the path.
 */
export function penPress(
  state: PenState,
  at: Vec2,
  closeRadius: number,
): { state: PenState; closed: boolean } {
  const first = state.vertices[0];
  if (
    first !== undefined &&
    state.vertices.length >= 3 &&
    Math.hypot(first.point[0] - at[0], first.point[1] - at[1]) <= closeRadius
  ) {
    return { state: { ...state, dragging: false }, closed: true };
  }
  return {
    state: {
      vertices: [...state.vertices, { point: at, inTangent: [0, 0], outTangent: [0, 0] }],
      dragging: true,
    },
    closed: false,
  };
}

/** While the button is held, the last vertex gets smooth tangents pointing at the pointer. */
export function penDrag(state: PenState, at: Vec2): PenState {
  if (!state.dragging) return state;
  const last = state.vertices[state.vertices.length - 1];
  if (last === undefined) return state;
  const out: Vec2 = [at[0] - last.point[0], at[1] - last.point[1]];
  const moved = Math.hypot(out[0], out[1]) > 3;
  const vertex: BezierVertex = moved
    ? { ...last, outTangent: out, inTangent: [-out[0], -out[1]] }
    : { ...last, outTangent: [0, 0], inTangent: [0, 0] };
  return { ...state, vertices: [...state.vertices.slice(0, -1), vertex] };
}

export const penRelease = (state: PenState): PenState => ({ ...state, dragging: false });

/** The finished path (null until there are two vertices). */
export function penPath(state: PenState, closed: boolean): BezierPath | null {
  if (state.vertices.length < 2) return null;
  return { closed: closed && state.vertices.length >= 3, vertices: state.vertices };
}

/** Removes the last placed vertex (Backspace while drawing). */
export const penUndo = (state: PenState): PenState => ({
  vertices: state.vertices.slice(0, -1),
  dragging: false,
});
