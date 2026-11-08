import type { ViewWindow } from "@lumacut/engine";
import { MAX_ZOOM, MIN_ZOOM, type PhotoView } from "./types.ts";

interface Size {
  width: number;
  height: number;
}

/** Room left around the canvas when it is fitted to the window, in screen pixels. */
const FIT_MARGIN = 24;

/** The zoom at which the whole canvas fits the window. */
export function fitZoom(canvas: Size, viewport: Size): number {
  if (viewport.width <= 0 || viewport.height <= 0) return 1;
  const z = Math.min(
    (viewport.width - 2 * FIT_MARGIN) / canvas.width,
    (viewport.height - 2 * FIT_MARGIN) / canvas.height,
  );
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z > 0 ? z : 1));
}

/** The zoom actually in effect (null means fit). */
export const effectiveZoom = (view: PhotoView, canvas: Size, viewport: Size): number =>
  view.zoom ?? fitZoom(canvas, viewport);

/** Canvas pixel at the middle of the window. */
export function centreOf(view: PhotoView, canvas: Size): { x: number; y: number } {
  return view.zoom === null
    ? { x: canvas.width / 2, y: canvas.height / 2 }
    : { x: view.centerX, y: view.centerY };
}

/** Screen position (relative to the window) of a canvas pixel. */
export function canvasToScreen(
  view: PhotoView,
  canvas: Size,
  viewport: Size,
  p: { x: number; y: number },
): { x: number; y: number } {
  const z = effectiveZoom(view, canvas, viewport);
  const c = centreOf(view, canvas);
  return { x: viewport.width / 2 + (p.x - c.x) * z, y: viewport.height / 2 + (p.y - c.y) * z };
}

/** Canvas pixel under a screen position (relative to the window). */
export function screenToCanvas(
  view: PhotoView,
  canvas: Size,
  viewport: Size,
  p: { x: number; y: number },
): { x: number; y: number } {
  const z = effectiveZoom(view, canvas, viewport);
  const c = centreOf(view, canvas);
  return { x: c.x + (p.x - viewport.width / 2) / z, y: c.y + (p.y - viewport.height / 2) / z };
}

/** The part of the canvas inside the window, in canvas pixels (empty when it is panned out of sight). */
export function visibleRect(
  view: PhotoView,
  canvas: Size,
  viewport: Size,
): { x: number; y: number; width: number; height: number } | null {
  const a = screenToCanvas(view, canvas, viewport, { x: 0, y: 0 });
  const b = screenToCanvas(view, canvas, viewport, { x: viewport.width, y: viewport.height });
  const x0 = Math.max(0, a.x);
  const y0 = Math.max(0, a.y);
  const x1 = Math.min(canvas.width, b.x);
  const y1 = Math.min(canvas.height, b.y);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/**
 * What the engine should draw: the visible part of the canvas, at the number of output pixels per
 * canvas pixel the screen can show (`dpr` screen-density aware, never more than 4× the canvas).
 */
export function engineWindow(
  view: PhotoView,
  canvas: Size,
  viewport: Size,
  dpr: number,
): ViewWindow | null {
  const rect = visibleRect(view, canvas, viewport);
  if (rect === null) return null;
  const z = effectiveZoom(view, canvas, viewport);
  return { ...rect, scale: Math.min(4, Math.max(0.01, z * dpr)) };
}

const clampZoom = (z: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/** Zoom by `factor`, keeping the canvas pixel under `focus` (a screen position; default the middle) in place. */
export function zoomAbout(
  view: PhotoView,
  canvas: Size,
  viewport: Size,
  factor: number,
  focus?: { x: number; y: number },
): PhotoView {
  const z0 = effectiveZoom(view, canvas, viewport);
  const z1 = clampZoom(z0 * factor);
  return zoomTo(view, canvas, viewport, z1, focus);
}

/** Zoom to an exact level (screen pixels per canvas pixel), keeping `focus` in place. */
export function zoomTo(
  view: PhotoView,
  canvas: Size,
  viewport: Size,
  zoom: number,
  focus: { x: number; y: number } = { x: viewport.width / 2, y: viewport.height / 2 },
): PhotoView {
  const z1 = clampZoom(zoom);
  const anchor = screenToCanvas(view, canvas, viewport, focus);
  return {
    zoom: z1,
    centerX: anchor.x - (focus.x - viewport.width / 2) / z1,
    centerY: anchor.y - (focus.y - viewport.height / 2) / z1,
  };
}

/** Slide the canvas by a screen-pixel offset. */
export function panBy(
  view: PhotoView,
  canvas: Size,
  viewport: Size,
  dx: number,
  dy: number,
): PhotoView {
  const z = effectiveZoom(view, canvas, viewport);
  const c = centreOf(view, canvas);
  return { zoom: z, centerX: c.x - dx / z, centerY: c.y - dy / z };
}

/** The SVG `viewBox` that makes an overlay line up with the window ("x y width height", canvas pixels). */
export function overlayViewBox(view: PhotoView, canvas: Size, viewport: Size): string {
  const z = effectiveZoom(view, canvas, viewport);
  const a = screenToCanvas(view, canvas, viewport, { x: 0, y: 0 });
  return `${String(a.x)} ${String(a.y)} ${String(viewport.width / z)} ${String(viewport.height / z)}`;
}
