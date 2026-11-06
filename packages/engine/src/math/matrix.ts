/**
 * 2D affine matrices as [a, b, c, d, e, f]:  x' = a·x + c·y + e,  y' = b·x + d·y + f.
 * Coordinates are pixels with the origin at the top-left and y pointing down, so a positive
 * rotation is clockwise on screen.
 */
import type { Transform } from "@lumacut/schema";

export type Mat = readonly [number, number, number, number, number, number];
export type Point = readonly [number, number];

export const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

/** `multiply(m, n)` applies `n` first, then `m`. */
export function multiply(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export const translate = (x: number, y: number): Mat => [1, 0, 0, 1, x, y];
export const scale = (sx: number, sy: number): Mat => [sx, 0, 0, sy, 0, 0];

/** Clockwise on screen, in degrees. */
export function rotate(degrees: number): Mat {
  const r = (degrees * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [c, s, -s, c, 0, 0];
}

/** Horizontal shear about the origin: a positive angle leans the top edge to the right. */
export function skewX(degrees: number): Mat {
  return [1, 0, -Math.tan((degrees * Math.PI) / 180), 1, 0, 0];
}

export function applyToPoint(m: Mat, [x, y]: Point): Point {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

export function invert(m: Mat): Mat {
  const det = m[0] * m[3] - m[1] * m[2];
  if (det === 0) throw new RangeError("Matrix is not invertible (a layer scaled to zero)");
  const a = m[3] / det;
  const b = -m[1] / det;
  const c = -m[2] / det;
  const d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}

/**
 * Layer pixels -> composition pixels:  T(x, y) · R · Skew · S · T(-anchor).
 * The anchor point of the layer lands exactly on (x, y) and is the pivot of rotation and scale.
 */
export function layerMatrix(t: Transform): Mat {
  return multiply(
    translate(t.x, t.y),
    multiply(
      rotate(t.rotation),
      multiply(
        skewX(t.skew),
        multiply(scale(t.scaleX, t.scaleY), translate(-t.anchorX, -t.anchorY)),
      ),
    ),
  );
}

/** Composition pixels -> OpenGL clip space (x, y in [-1, 1], y up). */
export function projection(width: number, height: number): Mat {
  return [2 / width, 0, 0, -2 / height, -1, 1];
}

/** Column-major 3x3 for a GLSL `mat3` uniform. */
export function toMat3(m: Mat): Float32Array {
  return new Float32Array([m[0], m[1], 0, m[2], m[3], 0, m[4], m[5], 1]);
}

export interface Crop {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** The visible part of a layer in layer pixels after cropping `crop` (fractions) off each edge. */
export function croppedRect(
  layerWidth: number,
  layerHeight: number,
  crop: Crop,
): { x: number; y: number; width: number; height: number } {
  const x = crop.left * layerWidth;
  const y = crop.top * layerHeight;
  return {
    x,
    y,
    width: Math.max(0, layerWidth - x - crop.right * layerWidth),
    height: Math.max(0, layerHeight - y - crop.bottom * layerHeight),
  };
}

/** Corners (clockwise from top-left) of the cropped layer in composition pixels. */
export function layerCorners(
  t: Transform,
  layerWidth: number,
  layerHeight: number,
  crop: Crop,
): [Point, Point, Point, Point] {
  const m = layerMatrix(t);
  const r = croppedRect(layerWidth, layerHeight, crop);
  return [
    applyToPoint(m, [r.x, r.y]),
    applyToPoint(m, [r.x + r.width, r.y]),
    applyToPoint(m, [r.x + r.width, r.y + r.height]),
    applyToPoint(m, [r.x, r.y + r.height]),
  ];
}
