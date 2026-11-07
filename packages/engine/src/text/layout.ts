import type { TextData, TextRun } from "@lumacut/schema";
import { cssFont } from "./fonts.ts";

/** How text is measured: the browser's canvas in the engine, a fake in tests. */
export interface Measurer {
  /** Advance width of `text` in `font` with extra spacing between characters. */
  width(text: string, font: string, letterSpacingPx: number): number;
  /** Font ascent/descent in px for the font (for baselines). */
  metrics(font: string): { ascent: number; descent: number };
}

export interface PlacedWord {
  text: string;
  run: TextRun;
  /** Left edge within the line, before alignment. */
  x: number;
  width: number;
  isSpace: boolean;
}

export interface Line {
  words: PlacedWord[];
  /** Width of the line without trailing spaces. */
  width: number;
  height: number;
  /** Baseline offset from the top of the line. */
  baseline: number;
  /** The line ended because the paragraph ended (not because it wrapped): justify skips it. */
  hardBreak: boolean;
}

export interface Layout {
  lines: Line[];
  /** Widest line / total height. */
  width: number;
  height: number;
}

export const fontOf = (run: TextRun): string =>
  cssFont(run.fontFamily, run.fontWeight, run.italic, run.fontSize);
export const spacingOf = (run: TextRun, tracking: number): number =>
  (tracking / 1000) * run.fontSize;

interface Token {
  text: string;
  run: TextRun;
  kind: "word" | "space" | "newline";
}

function tokenize(data: TextData): Token[] {
  const tokens: Token[] = [];
  for (const run of data.runs) {
    const pieces = run.text.split(/(\n|[ \t]+)/);
    for (const piece of pieces) {
      if (piece === "") continue;
      if (piece === "\n") tokens.push({ text: piece, run, kind: "newline" });
      else if (/^[ \t]+$/.test(piece)) tokens.push({ text: piece, run, kind: "space" });
      else tokens.push({ text: piece, run, kind: "word" });
    }
  }
  return tokens;
}

/**
 * Breaks styled text into lines: at newlines, and (for a paragraph box) where a word would pass
 * the box's width. A word longer than the box sits alone on its line. Measuring goes through
 * `measure`, so the same layout runs in a browser or in a test.
 */
export function layoutText(data: TextData, measure: Measurer): Layout {
  const maxWidth = data.box?.width ?? Infinity;
  const lines: Line[] = [];
  let words: PlacedWord[] = [];
  let x = 0;
  let sizeFallback = data.runs[0]?.fontSize ?? 16;

  const finish = (hardBreak: boolean): void => {
    while (words.length > 0 && words[words.length - 1]?.isSpace === true) words.pop();
    const width =
      words.length === 0
        ? 0
        : (words[words.length - 1]?.x ?? 0) + (words[words.length - 1]?.width ?? 0);
    let height = 0;
    let ascent = 0;
    let descent = 0;
    for (const w of words) {
      const m = measure.metrics(fontOf(w.run));
      ascent = Math.max(ascent, m.ascent);
      descent = Math.max(descent, m.descent);
      height = Math.max(height, w.run.fontSize * data.lineHeight);
    }
    if (words.length === 0) height = sizeFallback * data.lineHeight;
    const content = ascent + descent;
    lines.push({
      words,
      width,
      height,
      baseline: words.length === 0 ? height * 0.8 : (height - content) / 2 + ascent,
      hardBreak,
    });
    words = [];
    x = 0;
  };

  for (const token of tokenize(data)) {
    sizeFallback = token.run.fontSize;
    if (token.kind === "newline") {
      finish(true);
      continue;
    }
    const w = measure.width(token.text, fontOf(token.run), spacingOf(token.run, data.tracking));
    if (token.kind === "word" && x + w > maxWidth && words.some((p) => !p.isSpace)) finish(false);
    if (token.kind === "space" && words.length === 0) continue; // no leading spaces after a wrap
    words.push({ text: token.text, run: token.run, x, width: w, isSpace: token.kind === "space" });
    x += w;
  }
  finish(true);

  return {
    lines,
    width: Math.max(0, ...lines.map((l) => l.width)),
    height: lines.reduce((sum, l) => sum + l.height, 0),
  };
}
