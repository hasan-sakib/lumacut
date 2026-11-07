import type { Composition, TextData } from "@lumacut/schema";

/** A new text clip's look: bold white Inter with a soft shadow, sized to the composition. */
export function defaultTextData(comp: Pick<Composition, "height">, content: string): TextData {
  return {
    runs: [
      {
        text: content,
        fontFamily: "Inter",
        fontWeight: 700,
        fontSize: Math.max(12, Math.round(comp.height * 0.09)),
        color: { r: 1, g: 1, b: 1, a: 1 },
        italic: false,
        underline: false,
      },
    ],
    align: "center",
    lineHeight: 1.2,
    tracking: 0,
    shadow: { color: { r: 0, g: 0, b: 0, a: 0.5 }, offset: [0, 4], blur: 8 },
    animators: [],
  };
}

/** The text of a text clip as one string (its runs joined). */
export const textContent = (data: TextData): string => data.runs.map((r) => r.text).join("");

/** The text with new content: the first run's style is kept for all of it. */
export function withContent(data: TextData, content: string): TextData {
  const first = data.runs[0];
  return first === undefined ? data : { ...data, runs: [{ ...first, text: content }] };
}
