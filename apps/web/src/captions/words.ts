import type { CaptionWord } from "@lumacut/schema";

/** Words of `text` timed evenly by length across `durationUs` (clip-relative, back to back). */
export function wordsFromText(text: string, durationUs: number): CaptionWord[] {
  const tokens = text.split(/\s+/).filter((t) => t !== "");
  if (tokens.length === 0) return [];
  const total = tokens.reduce((sum, t) => sum + t.length + 1, 0);
  const words: CaptionWord[] = [];
  let at = 0;
  tokens.forEach((token, i) => {
    const end =
      i === tokens.length - 1
        ? durationUs
        : at + Math.round(((token.length + 1) / total) * durationUs);
    words.push({ text: token, startUs: at, endUs: Math.max(at + 1, end) });
    at = Math.max(at + 1, end);
  });
  return words;
}

const copy = (words: readonly CaptionWord[]): CaptionWord[] => words.map((w) => ({ ...w }));

/** Replaces one word's text (an empty text deletes it). */
export function setWordText(
  words: readonly CaptionWord[],
  index: number,
  text: string,
): CaptionWord[] {
  const next = copy(words);
  const word = next[index];
  if (word === undefined) return next;
  const trimmed = text.trim();
  if (trimmed === "") return next.filter((_, i) => i !== index);
  word.text = trimmed;
  return next;
}

/**
 * Moves a word's start and/or end. A word keeps at least 1 µs, never overlaps its neighbours and
 * stays inside [0, limitUs].
 */
export function retimeWord(
  words: readonly CaptionWord[],
  index: number,
  change: { startUs?: number; endUs?: number },
  limitUs: number,
): CaptionWord[] {
  const next = copy(words);
  const word = next[index];
  if (word === undefined) return next;
  const before = next[index - 1]?.endUs ?? 0;
  const after = next[index + 1]?.startUs ?? limitUs;
  const start = Math.round(Math.min(Math.max(change.startUs ?? word.startUs, before), after - 1));
  const end = Math.round(Math.min(Math.max(change.endUs ?? word.endUs, start + 1), after));
  word.startUs = start;
  word.endUs = end;
  return next;
}

/** Cuts a word into two at a character offset, dividing its time in proportion. */
export function splitWord(words: readonly CaptionWord[], index: number, at: number): CaptionWord[] {
  const word = words[index];
  if (word === undefined || at <= 0 || at >= word.text.length) return copy(words);
  const cut = Math.round(word.startUs + ((word.endUs - word.startUs) * at) / word.text.length);
  const point = Math.min(word.endUs - 1, Math.max(word.startUs + 1, cut));
  const next = copy(words);
  next.splice(
    index,
    1,
    { text: word.text.slice(0, at), startUs: word.startUs, endUs: point },
    { text: word.text.slice(at), startUs: point, endUs: word.endUs },
  );
  return next;
}

/** Joins a word with the one after it (its time runs to the later word's end). */
export function mergeWithNext(words: readonly CaptionWord[], index: number): CaptionWord[] {
  const a = words[index];
  const b = words[index + 1];
  if (a === undefined || b === undefined) return copy(words);
  const next = copy(words);
  next.splice(index, 2, { text: `${a.text}${b.text}`, startUs: a.startUs, endUs: b.endUs });
  return next;
}

export function removeWord(words: readonly CaptionWord[], index: number): CaptionWord[] {
  return copy(words).filter((_, i) => i !== index);
}

/** Shifts every word by `deltaUs`, kept inside [0, limitUs]. */
export function shiftWords(
  words: readonly CaptionWord[],
  deltaUs: number,
  limitUs: number,
): CaptionWord[] {
  if (words.length === 0) return [];
  const first = words[0]?.startUs ?? 0;
  const last = words[words.length - 1]?.endUs ?? 0;
  const delta = Math.round(Math.min(limitUs - last, Math.max(-first, deltaUs)));
  return words.map((w) => ({ ...w, startUs: w.startUs + delta, endUs: w.endUs + delta }));
}
