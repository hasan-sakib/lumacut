import type { Color, TextData } from "@lumacut/schema";
import { fontOf, layoutText, spacingOf, type Layout, type Measurer } from "./layout.ts";

export interface TextRaster {
  canvas: OffscreenCanvas;
  /** Size in pixels, including the margin around the text for stroke, shadow and background. */
  width: number;
  height: number;
}

const css = (c: Color): string =>
  `rgba(${String(Math.round(c.r * 255))}, ${String(Math.round(c.g * 255))}, ${String(Math.round(c.b * 255))}, ${String(c.a)})`;

/** Canvas-backed text measurement. */
export function canvasMeasurer(): Measurer {
  const ctx = new OffscreenCanvas(1, 1).getContext("2d");
  if (ctx === null) throw new Error("This browser can't measure text (no 2D canvas)");
  return {
    width(text, font, letterSpacingPx) {
      ctx.font = font;
      ctx.letterSpacing = `${String(letterSpacingPx)}px`;
      return ctx.measureText(text).width;
    },
    metrics(font) {
      ctx.font = font;
      ctx.letterSpacing = "0px";
      const m = ctx.measureText("Hg");
      return { ascent: m.fontBoundingBoxAscent, descent: m.fontBoundingBoxDescent };
    },
  };
}

/** How far the stroke, shadow and background reach past the text block. */
export function textMargin(data: TextData): number {
  const stroke = data.stroke?.width ?? 0;
  const shadow =
    data.shadow === undefined
      ? 0
      : data.shadow.blur * 2 +
        Math.max(Math.abs(data.shadow.offset[0]), Math.abs(data.shadow.offset[1]));
  const background = data.background?.padding ?? 0;
  return Math.ceil(Math.max(stroke, shadow, background)) + 2;
}

/**
 * Draws styled text into a canvas of its own (transparent background). Point text is as big as its
 * lines; paragraph text (a `box`) is exactly the box. The picture is sRGB-encoded, ready to be
 * uploaded like any image.
 */
export function renderText(data: TextData, measure: Measurer = canvasMeasurer()): TextRaster {
  const layout: Layout = layoutText(data, measure);
  const margin = textMargin(data);
  const blockW = Math.max(1, Math.ceil(data.box?.width ?? layout.width));
  const blockH = Math.max(1, Math.ceil(data.box?.height ?? layout.height));
  const width = blockW + 2 * margin;
  const height = blockH + 2 * margin;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("This browser can't draw text (no 2D canvas)");
  ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round";

  if (data.background !== undefined && layout.lines.length > 0) {
    const pad = data.background.padding;
    const rect = {
      x: margin - pad,
      y: margin - pad,
      w: (data.box === undefined ? layout.width : blockW) + 2 * pad,
      h: layout.height + 2 * pad,
    };
    ctx.fillStyle = css(data.background.color);
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, data.background.cornerRadius);
    ctx.fill();
  }

  let top = margin;
  for (const line of layout.lines) {
    const free = blockW - line.width;
    const spaces = line.words.filter((w) => w.isSpace).length;
    let originX = margin;
    let extra = 0;
    if (data.align === "center") originX += free / 2;
    else if (data.align === "right") originX += free;
    else if (data.align === "justify" && !line.hardBreak && spaces > 0 && free > 0)
      extra = free / spaces;
    let shift = 0;
    for (const word of line.words) {
      if (word.isSpace) {
        shift += extra;
        continue;
      }
      ctx.font = fontOf(word.run);
      ctx.letterSpacing = `${String(spacingOf(word.run, data.tracking))}px`;
      const x = originX + word.x + shift;
      const y = top + line.baseline;
      if (data.shadow !== undefined) {
        ctx.shadowColor = css(data.shadow.color);
        ctx.shadowBlur = data.shadow.blur * 2;
        ctx.shadowOffsetX = data.shadow.offset[0];
        ctx.shadowOffsetY = data.shadow.offset[1];
      }
      if (data.stroke !== undefined && data.stroke.width > 0) {
        ctx.strokeStyle = css(data.stroke.color);
        ctx.lineWidth = data.stroke.width * 2; // the fill covers the inner half
        ctx.strokeText(word.text, x, y);
      }
      ctx.fillStyle = css(word.run.color);
      ctx.fillText(word.text, x, y);
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      if (word.run.underline) {
        ctx.fillRect(
          x,
          y + word.run.fontSize * 0.1,
          word.width,
          Math.max(1, word.run.fontSize / 16),
        );
      }
    }
    top += line.height;
  }
  return { canvas, width, height };
}
