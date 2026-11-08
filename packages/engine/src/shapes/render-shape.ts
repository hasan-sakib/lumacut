import type { Color, ShapeData } from "@lumacut/schema";
import {
  addOutline,
  itemOutline,
  outlineBounds,
  outlineLength,
  type Bounds,
  type Outline,
} from "./outline.ts";

export interface ShapeRaster {
  canvas: OffscreenCanvas;
  /** Size of the picture in pixels (at `resolution` pixels per layer pixel). */
  width: number;
  height: number;
  /** Pixels per layer pixel the picture was drawn at. */
  resolution: number;
  /** Where the shape's own origin (0, 0) sits in the picture, in layer pixels (the transform anchor). */
  originX: number;
  originY: number;
  /** The picture's size in layer pixels. */
  layerWidth: number;
  layerHeight: number;
}

const css = (c: Color): string =>
  `rgba(${String(Math.round(c.r * 255))}, ${String(Math.round(c.g * 255))}, ${String(Math.round(c.b * 255))}, ${String(c.a)})`;

/** The dash pattern that shows only the trimmed part of a path of length `length`. */
export function trimDash(
  trim: { start: number; end: number; offset: number },
  length: number,
): { dash: number[]; offset: number } | null {
  const visible = Math.max(0, Math.min(1, trim.end) - Math.max(0, trim.start)) * length;
  if (visible <= 0) return null;
  if (visible >= length) return { dash: [], offset: 0 };
  const begin = (((trim.start + trim.offset / 360) % 1) + 1) % 1;
  return { dash: [visible, length - visible], offset: -begin * length };
}

export interface ShapeMetrics {
  outlines: Outline[];
  bounds: Bounds;
  margin: number;
  /** Size of the picture in layer pixels, and where the shape's (0, 0) sits in it. */
  layerWidth: number;
  layerHeight: number;
  originX: number;
  originY: number;
}

/** Where a shape's picture is and how big (cheap: no drawing), or null for an empty shape. */
export function shapeMetrics(shape: ShapeData): ShapeMetrics | null {
  const outlines: Outline[] = shape.items.map((item) => itemOutline(item, shape.roundCorners ?? 0));
  let bounds: Bounds | null = null;
  for (const o of outlines) {
    const b = outlineBounds(o);
    if (b === null) continue;
    bounds =
      bounds === null
        ? b
        : {
            minX: Math.min(bounds.minX, b.minX),
            minY: Math.min(bounds.minY, b.minY),
            maxX: Math.max(bounds.maxX, b.maxX),
            maxY: Math.max(bounds.maxY, b.maxY),
          };
  }
  if (bounds === null) return null;
  const stroke = shape.stroke;
  const margin = Math.ceil(
    (stroke === undefined ? 0 : stroke.width * (stroke.join === "miter" ? 2 : 0.75)) + 2,
  );
  return {
    outlines,
    bounds,
    margin,
    layerWidth: Math.max(1, Math.ceil(bounds.maxX - bounds.minX) + 2 * margin),
    layerHeight: Math.max(1, Math.ceil(bounds.maxY - bounds.minY) + 2 * margin),
    originX: margin - bounds.minX,
    originY: margin - bounds.minY,
  };
}

/**
 * Draws a shape layer into a canvas of its own: all item outlines filled together (so even-odd
 * works across items), then each item stroked (with its own trim/dash). The picture is exactly the
 * shape's bounds plus the stroke; `originX/Y` say where the shape's (0, 0) is inside it.
 */
export function renderShape(shape: ShapeData, resolution: number): ShapeRaster | null {
  const m = shapeMetrics(shape);
  if (m === null) return null;
  const { outlines, bounds, margin, layerWidth, layerHeight } = m;
  const stroke = shape.stroke;
  const width = Math.max(1, Math.ceil(layerWidth * resolution));
  const height = Math.max(1, Math.ceil(layerHeight * resolution));
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("This browser can't draw shapes (no 2D canvas)");
  ctx.scale(resolution, resolution);
  ctx.translate(margin - bounds.minX, margin - bounds.minY);

  if (shape.fill !== undefined) {
    const all = new Path2D();
    for (const o of outlines) addOutline(all, o);
    ctx.fillStyle = css(shape.fill.color);
    ctx.fill(all, shape.fill.rule);
  }
  if (stroke !== undefined && stroke.width > 0) {
    ctx.strokeStyle = css(stroke.color);
    ctx.lineWidth = stroke.width;
    ctx.lineCap = stroke.cap;
    ctx.lineJoin = stroke.join;
    for (const o of outlines) {
      const path = new Path2D();
      addOutline(path, o);
      const trim = shape.trimPaths;
      const trimmed =
        trim !== undefined && (trim.start > 0 || trim.end < 1 || trim.offset % 360 !== 0)
          ? trimDash(trim, outlineLength(o))
          : undefined;
      if (trim !== undefined && trimmed === null) continue; // trimmed away entirely
      if (trimmed !== undefined && trimmed !== null) {
        ctx.setLineDash(trimmed.dash);
        ctx.lineDashOffset = trimmed.offset;
      } else {
        ctx.setLineDash(stroke.dash);
        ctx.lineDashOffset = 0;
      }
      ctx.stroke(path);
    }
  }
  return {
    canvas,
    width,
    height,
    resolution,
    originX: margin - bounds.minX,
    originY: margin - bounds.minY,
    layerWidth,
    layerHeight,
  };
}
