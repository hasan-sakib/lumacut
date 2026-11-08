import type { BezierPath, Color } from "@lumacut/schema";

/** What the pointer does on the canvas in the photo workspace (besides select, shapes and the pen). */
export type PhotoTool =
  | "marqueeRect"
  | "marqueeEllipse"
  | "lasso"
  | "crop"
  | "brush"
  | "eraser"
  | "maskBrush"
  | "hand"
  | "zoom";

export const PHOTO_TOOLS: ReadonlySet<string> = new Set<PhotoTool>([
  "marqueeRect",
  "marqueeEllipse",
  "lasso",
  "crop",
  "brush",
  "eraser",
  "maskBrush",
  "hand",
  "zoom",
]);

export const isPhotoTool = (tool: string): tool is PhotoTool => PHOTO_TOOLS.has(tool);

/** Brush options, shared by the brush, eraser and mask brush. Size is in canvas pixels. */
export interface BrushSettings {
  size: number;
  /** 0 = soft edge … 1 = hard edge. */
  hardness: number;
  opacity: number;
  /** The paint colour (straight sRGB). The mask brush paints in white or black and ignores it. */
  color: Color;
}

export const DEFAULT_BRUSH: BrushSettings = {
  size: 40,
  hardness: 0.6,
  opacity: 1,
  color: { r: 0.1, g: 0.1, b: 0.1, a: 1 },
};

/**
 * A selection: one closed path in composition pixels. It is editor state (not saved in the
 * project); "Selection to mask" turns it into a mask on a layer.
 */
export interface Selection {
  path: BezierPath;
  /** Edge softness in canvas pixels, used when it becomes a mask. */
  feather: number;
  /** Everything but the path is selected. */
  inverted: boolean;
}

/** Where the canvas is on screen: `zoom` is screen pixels per canvas pixel, null = fit the window. */
export interface PhotoView {
  zoom: number | null;
  /** Canvas pixel at the middle of the window (ignored while fitting). */
  centerX: number;
  centerY: number;
}

export const FIT_VIEW: PhotoView = { zoom: null, centerX: 0, centerY: 0 };
export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 32;

export type ImageFormat = "png" | "jpeg" | "webp";

/** One picture to render and encode (photo export, or any frame of a video). */
export interface ImageExportRequest {
  compositionId: string;
  /** Composition time to draw; photos use 0. */
  tUs: number;
  format: ImageFormat;
  /** 0..1, used by JPEG and WebP. */
  quality: number;
  /** Output pixels per canvas pixel (1 = the canvas size). */
  scale: number;
  /** Colour to flatten transparency onto (always for JPEG); null keeps transparency (PNG, WebP). */
  background: Color | null;
}
