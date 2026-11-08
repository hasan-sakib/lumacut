import type { Point } from "./viewport.ts";

export type GizmoDrag = "move" | "scale" | "rotate";

/** The new position after dragging the pointer by (dx, dy) composition pixels. */
export const dragMove = (start: Point, dx: number, dy: number): Point => ({
  x: start.x + dx,
  y: start.y + dy,
});

/**
 * Uniform scale: the layer grows by how much farther the pointer is from the layer's anchor now than
 * when the drag started (the anchor stays where it is).
 */
export function dragScale(
  startScale: readonly [number, number],
  origin: Point,
  startPointer: Point,
  pointer: Point,
): [number, number] {
  const before = Math.hypot(startPointer.x - origin.x, startPointer.y - origin.y);
  const now = Math.hypot(pointer.x - origin.x, pointer.y - origin.y);
  if (before < 1) return [startScale[0], startScale[1]];
  const k = now / before;
  return [startScale[0] * k, startScale[1] * k];
}

/** The new rotation (degrees, clockwise) after turning the pointer around the anchor. */
export function dragRotate(
  startRotation: number,
  origin: Point,
  startPointer: Point,
  pointer: Point,
  snap = false,
): number {
  const a0 = Math.atan2(startPointer.y - origin.y, startPointer.x - origin.x);
  const a1 = Math.atan2(pointer.y - origin.y, pointer.x - origin.x);
  let degrees = startRotation + ((a1 - a0) * 180) / Math.PI;
  if (snap) degrees = Math.round(degrees / 15) * 15;
  return degrees;
}
