import type { CaptionData, Clip, TextData, TextRun } from "@lumacut/schema";

export interface CaptionLine {
  /** Indices into `caption.words`. */
  words: number[];
}
export interface CaptionPage {
  lines: CaptionLine[];
  /** Index of the first word on the page. */
  first: number;
  /** One past the last word index. */
  end: number;
}

const DEFAULT_MAX_LINES = 2;
const DEFAULT_MAX_CHARS = 32;

/**
 * Splits caption words into on-screen pages: words fill lines up to `maxCharsPerLine`, lines fill
 * pages up to `maxLines`. A page shows from its first word's start until the next page's first
 * word starts.
 */
export function captionPages(caption: CaptionData): CaptionPage[] {
  const maxLines = caption.maxLines ?? DEFAULT_MAX_LINES;
  const maxChars = caption.maxCharsPerLine ?? DEFAULT_MAX_CHARS;
  const pages: CaptionPage[] = [];
  let lines: CaptionLine[] = [];
  let current: number[] = [];
  let chars = 0;
  let first = 0;
  const closeLine = (): void => {
    if (current.length > 0) lines.push({ words: current });
    current = [];
    chars = 0;
  };
  const closePage = (end: number): void => {
    closeLine();
    if (lines.length > 0) pages.push({ lines, first, end });
    lines = [];
    first = end;
  };
  caption.words.forEach((word, i) => {
    const length = word.text.length + (current.length > 0 ? 1 : 0);
    if (current.length > 0 && chars + length > maxChars) {
      closeLine();
      if (lines.length >= maxLines) closePage(i);
    }
    current.push(i);
    chars += word.text.length + (current.length > 1 ? 1 : 0);
  });
  closePage(caption.words.length);
  return pages;
}

/** The page being shown at `localUs` (clip-local), and the word being spoken on it, if any. */
export function captionStateAt(
  caption: CaptionData,
  localUs: number,
): { page: CaptionPage; active: number | null } | null {
  const pages = captionPages(caption);
  let shown: CaptionPage | undefined;
  for (const page of pages) {
    const start = caption.words[page.first]?.startUs ?? Infinity;
    if (start <= localUs) shown = page;
  }
  if (shown === undefined) return null;
  const active = caption.words.findIndex((w) => w.startUs <= localUs && localUs < w.endUs);
  const onPage = active >= shown.first && active < shown.end;
  return { page: shown, active: onPage ? active : null };
}

/**
 * The styled text a caption clip draws at `localUs`: the current page's words as one run each
 * (styled like the clip's first run), the spoken word in `highlightColor` when there is one.
 */
export function captionTextAt(clip: Clip, localUs: number): TextData | null {
  const caption = clip.caption;
  const style = clip.text;
  if (caption === undefined || style === undefined) return null;
  const state = captionStateAt(caption, localUs);
  if (state === null) return null;
  const base = style.runs[0];
  if (base === undefined) return null;
  const runs: TextRun[] = [];
  state.page.lines.forEach((line, li) => {
    line.words.forEach((index, wi) => {
      const word = caption.words[index];
      if (word === undefined) return;
      const spoken = index === state.active && caption.highlightColor !== undefined;
      const text = wi < line.words.length - 1 ? `${word.text} ` : word.text;
      runs.push({
        ...base,
        text,
        color: spoken && caption.highlightColor !== undefined ? caption.highlightColor : base.color,
      });
    });
    if (li < state.page.lines.length - 1) runs.push({ ...base, text: "\n" });
  });
  if (runs.length === 0) return null;
  return { ...style, runs };
}
