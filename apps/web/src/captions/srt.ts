import type { CaptionWord } from "@lumacut/schema";
import { wordsFromText } from "./words.ts";

export interface Cue {
  startUs: number;
  endUs: number;
  text: string;
}

const TIME = /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/;

function toUs(match: RegExpExecArray): number {
  const h = Number(match[1] ?? 0);
  const m = Number(match[2]);
  const s = Number(match[3]);
  const ms = Number((match[4] ?? "0").padEnd(3, "0"));
  return ((h * 60 + m) * 60 + s) * 1_000_000 + ms * 1000;
}

/**
 * Cues from SRT or WebVTT text. Cue numbers, the WEBVTT header, NOTE blocks and markup tags are
 * ignored; a cue whose times can't be read is skipped.
 */
export function parseCues(source: string): Cue[] {
  const blocks = source
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/);
  const cues: Cue[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    const at = lines.findIndex((l) => l.includes("-->"));
    if (at < 0 || /^NOTE\b/.test(lines[0] ?? "")) continue;
    const [from, to] = (lines[at] ?? "").split("-->");
    const a = TIME.exec(from ?? "");
    const b = TIME.exec(to ?? "");
    if (a === null || b === null) continue;
    const startUs = toUs(a);
    const endUs = toUs(b);
    const text = lines
      .slice(at + 1)
      .join(" ")
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (text !== "" && endUs > startUs) cues.push({ startUs, endUs, text });
  }
  return cues.sort((x, y) => x.startUs - y.startUs);
}

/**
 * One caption's words from cues: every cue's text is divided over its time by word length, and
 * times are relative to the first cue's start (the caption clip starts there).
 */
export function wordsFromCues(cues: readonly Cue[]): { words: CaptionWord[]; durationUs: number } {
  const first = cues[0];
  const last = cues[cues.length - 1];
  if (first === undefined || last === undefined) return { words: [], durationUs: 0 };
  const origin = first.startUs;
  const words: CaptionWord[] = [];
  for (const cue of cues) {
    for (const w of wordsFromText(cue.text, cue.endUs - cue.startUs)) {
      words.push({
        text: w.text,
        startUs: cue.startUs - origin + w.startUs,
        endUs: cue.startUs - origin + w.endUs,
      });
    }
  }
  return { words, durationUs: last.endUs - origin };
}
