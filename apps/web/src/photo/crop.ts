import type { CropBox } from "../stores/photo.ts";

export type CropHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "move";

const MIN_SIDE = 8;

/**
 * Drag a handle of the crop box by (dx, dy) canvas pixels. The box stays inside the canvas, at
 * least a few pixels wide, and (with `aspect`, width ÷ height) in proportion.
 */
export function dragCrop(
  box: CropBox,
  handle: CropHandle,
  dx: number,
  dy: number,
  canvas: { width: number; height: number },
  aspect: number | null,
): CropBox {
  if (handle === "move") {
    return {
      ...box,
      x: Math.min(Math.max(0, box.x + dx), canvas.width - box.width),
      y: Math.min(Math.max(0, box.y + dy), canvas.height - box.height),
    };
  }
  let left = box.x;
  let top = box.y;
  let right = box.x + box.width;
  let bottom = box.y + box.height;
  if (handle.includes("w")) left += dx;
  if (handle.includes("e")) right += dx;
  if (handle.includes("n")) top += dy;
  if (handle.includes("s")) bottom += dy;
  left = Math.min(Math.max(0, left), right - MIN_SIDE);
  right = Math.max(Math.min(canvas.width, right), left + MIN_SIDE);
  top = Math.min(Math.max(0, top), bottom - MIN_SIDE);
  bottom = Math.max(Math.min(canvas.height, bottom), top + MIN_SIDE);
  if (aspect !== null && aspect > 0) {
    // Keep the dragged edge(s) and fit the other side to the proportion, inside the canvas.
    const movesX = handle.includes("w") || handle.includes("e");
    const movesY = handle.includes("n") || handle.includes("s");
    let width = right - left;
    let height = bottom - top;
    if (movesX && !movesY) height = width / aspect;
    else if (movesY && !movesX) width = height * aspect;
    else if (width / height > aspect) width = height * aspect;
    else height = width / aspect;
    if (handle.includes("w")) left = right - width;
    else right = left + width;
    if (handle.includes("n")) top = bottom - height;
    else bottom = top + height;
    if (left < 0 || top < 0 || right > canvas.width || bottom > canvas.height) return box;
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** The largest box with the given proportion (width ÷ height) that fits the canvas, centred. */
export function fitAspect(canvas: { width: number; height: number }, aspect: number): CropBox {
  let width = canvas.width;
  let height = width / aspect;
  if (height > canvas.height) {
    height = canvas.height;
    width = height * aspect;
  }
  return {
    x: (canvas.width - width) / 2,
    y: (canvas.height - height) / 2,
    width,
    height,
  };
}
