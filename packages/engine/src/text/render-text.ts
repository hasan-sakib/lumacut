import type { Color, TextData } from "@lumacut/schema";
import { mixColor, styleForUnit } from "./animate.ts";
import {
  fontOf,
  layoutText,
  spacingOf,
  type Layout,
  type Measurer,
  type PlacedWord,
} from "./layout.ts";

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

/** How far the stroke, shadow, background and animator offsets reach past the text block. */
export function textMargin(data: TextData): number {
  const stroke = data.stroke?.width ?? 0;
  const shadow =
    data.shadow === undefined
      ? 0
      : data.shadow.blur * 2 +
        Math.max(Math.abs(data.shadow.offset[0]), Math.abs(data.shadow.offset[1]));
  const background = data.background?.padding ?? 0;
  // Animators move, scale and blur characters; leave room so they aren't cut off.
  const motion = data.animators.reduce((m, a) => {
    const p = a.props;
    const move =
      p.position === undefined ? 0 : Math.max(Math.abs(p.position[0]), Math.abs(p.position[1]));
    const grow = p.scale === undefined ? 0 : Math.max(p.scale[0], p.scale[1]) * 24;
    return Math.max(m, move, grow, (p.blur ?? 0) * 3, p.rotation === undefined ? 0 : 40);
  }, 0);
  return Math.ceil(Math.max(stroke, shadow, background, motion)) + 2;
}

/**
 * Draws styled text into a canvas of its own (transparent background). Point text is as big as its
 * lines; paragraph text (a `box`) is exactly the box. The picture is sRGB-encoded, ready to be
 * uploaded like any image. With text animators each character is drawn on its own, moved, scaled,
 * rotated, faded and tinted by how much of each animator's range covers it.
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

  // Unit counts for the animators' range selectors.
  const visible = layout.lines.flatMap((l) => l.words.filter((w) => !w.isSpace));
  const counts = {
    char: visible.reduce((n, w) => n + Array.from(w.text).length, 0),
    word: visible.length,
    line: layout.lines.length,
  };
  let wordSeen = 0;
  let charSeen = 0;
  // Rotation and scale turn about the centre of the unit the animator selects.
  const originUnit =
    data.animators.find((a) => a.props.rotation !== undefined || a.props.scale !== undefined)
      ?.unit ?? "char";

  const strokeAndFill = (text: string, x: number, y: number, fill: Color): void => {
    if (data.shadow !== undefined) {
      ctx.shadowColor = css(data.shadow.color);
      ctx.shadowBlur = data.shadow.blur * 2;
      ctx.shadowOffsetX = data.shadow.offset[0];
      ctx.shadowOffsetY = data.shadow.offset[1];
    }
    if (data.stroke !== undefined && data.stroke.width > 0) {
      ctx.strokeStyle = css(data.stroke.color);
      ctx.lineWidth = data.stroke.width * 2; // the fill covers the inner half
      ctx.strokeText(text, x, y);
    }
    ctx.fillStyle = css(fill);
    ctx.fillText(text, x, y);
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  };

  const drawAnimated = (
    word: PlacedWord,
    lineIndex: number,
    x: number,
    y: number,
    lineCentre: { x: number; y: number },
  ): void => {
    const font = fontOf(word.run);
    const spacing = spacingOf(word.run, data.tracking);
    const chars = Array.from(word.text);
    const wordIndex = wordSeen;
    wordSeen += 1;
    const mid = y - word.run.fontSize * 0.35;
    let extra = 0;
    chars.forEach((ch, ci) => {
      ctx.font = font;
      ctx.letterSpacing = `${String(spacing)}px`;
      const cx = x + measure.width(chars.slice(0, ci).join(""), font, spacing) + extra;
      const cw = measure.width(ch, font, spacing);
      const style = styleForUnit(data.animators, counts, {
        char: charSeen,
        word: wordIndex,
        line: lineIndex,
      });
      charSeen += 1;
      extra += (style.tracking / 1000) * word.run.fontSize;
      const origin =
        originUnit === "char"
          ? { x: cx + cw / 2, y: mid }
          : originUnit === "word"
            ? { x: x + word.width / 2, y: mid }
            : lineCentre;
      ctx.save();
      ctx.globalAlpha = Math.min(1, Math.max(0, style.alpha)) * word.run.color.a;
      ctx.translate(origin.x + style.dx, origin.y + style.dy);
      ctx.rotate((style.rotation * Math.PI) / 180);
      ctx.scale(style.sx, style.sy);
      ctx.translate(-origin.x, -origin.y);
      if (style.blur > 0) ctx.filter = `blur(${String(style.blur)}px)`;
      const fill =
        style.fill === null
          ? word.run.color
          : mixColor(word.run.color, style.fill.color, style.fill.amount);
      strokeAndFill(ch, cx, y, { ...fill, a: 1 });
      ctx.restore();
    });
  };

  let top = margin;
  layout.lines.forEach((line, lineIndex) => {
    const free = blockW - line.width;
    const spaces = line.words.filter((w) => w.isSpace).length;
    let originX = margin;
    let extra = 0;
    if (data.align === "center") originX += free / 2;
    else if (data.align === "right") originX += free;
    else if (data.align === "justify" && !line.hardBreak && spaces > 0 && free > 0)
      extra = free / spaces;
    let shift = 0;
    const lineCentre = { x: originX + line.width / 2, y: top + line.height / 2 };
    for (const word of line.words) {
      if (word.isSpace) {
        shift += extra;
        continue;
      }
      const x = originX + word.x + shift;
      const y = top + line.baseline;
      if (data.animators.length > 0) {
        drawAnimated(word, lineIndex, x, y, lineCentre);
        continue;
      }
      ctx.font = fontOf(word.run);
      ctx.letterSpacing = `${String(spacingOf(word.run, data.tracking))}px`;
      strokeAndFill(word.text, x, y, word.run.color);
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
  });
  return { canvas, width, height };
}
