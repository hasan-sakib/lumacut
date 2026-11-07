/**
 * The fonts Lumacut ships (all SIL Open Font License; see apps/web/public/fonts/OFL-*.txt). Text
 * uses these by family name; any other name falls back to the browser's sans-serif and is reported.
 */
export interface FontFile {
  file: string;
  /** Weight the file covers: one value, or a range for variable fonts. */
  weight: [number, number];
  italic: boolean;
}

export interface BundledFont {
  label: string;
  /** What to try if the files can't load. */
  fallback: "sans-serif" | "serif" | "monospace" | "cursive";
  files: FontFile[];
}

const variable = (base: string, italicToo = true): FontFile[] => [
  { file: `${base}.ttf`, weight: [100, 900], italic: false },
  ...(italicToo
    ? [{ file: `${base}-Italic.ttf`, weight: [100, 900] as [number, number], italic: true }]
    : []),
];

export const BUNDLED_FONTS: Readonly<Record<string, BundledFont>> = {
  Inter: { label: "Inter", fallback: "sans-serif", files: variable("Inter") },
  Montserrat: { label: "Montserrat", fallback: "sans-serif", files: variable("Montserrat") },
  Poppins: {
    label: "Poppins",
    fallback: "sans-serif",
    files: [
      { file: "Poppins-Regular.ttf", weight: [400, 400], italic: false },
      { file: "Poppins-Italic.ttf", weight: [400, 400], italic: true },
      { file: "Poppins-Bold.ttf", weight: [700, 700], italic: false },
      { file: "Poppins-BoldItalic.ttf", weight: [700, 700], italic: true },
    ],
  },
  "Playfair Display": {
    label: "Playfair Display",
    fallback: "serif",
    files: variable("PlayfairDisplay"),
  },
  "Bebas Neue": {
    label: "Bebas Neue",
    fallback: "sans-serif",
    files: [{ file: "BebasNeue-Regular.ttf", weight: [400, 400], italic: false }],
  },
  "Roboto Mono": { label: "Roboto Mono", fallback: "monospace", files: variable("RobotoMono") },
  Caveat: {
    label: "Caveat",
    fallback: "cursive",
    files: [{ file: "Caveat.ttf", weight: [400, 700], italic: false }],
  },
};

export const FONT_FAMILIES: readonly string[] = Object.keys(BUNDLED_FONTS);

/** The CSS font shorthand for canvas: style, weight, size and the family with its fallback. */
export function cssFont(family: string, weight: number, italic: boolean, sizePx: number): string {
  const fallback = BUNDLED_FONTS[family]?.fallback ?? "sans-serif";
  return `${italic ? "italic " : ""}${String(weight)} ${String(sizePx)}px "${family}", ${fallback}`;
}

interface FontSet {
  add(face: FontFace): void;
}

function fontSet(): FontSet | null {
  if (typeof document !== "undefined") return document.fonts;
  const worker = globalThis as unknown as { fonts?: FontSet };
  return worker.fonts ?? null;
}

/** Loads bundled font files on first use. One instance per engine. */
export class FontLoader {
  readonly #baseUrl: string;
  readonly #loaded = new Map<string, Promise<boolean>>();

  constructor(baseUrl: string) {
    this.#baseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  }

  /** True when the family is bundled and its files loaded; false (never throws) otherwise. */
  ensure(family: string): Promise<boolean> {
    const known = BUNDLED_FONTS[family];
    if (known === undefined) return Promise.resolve(false);
    let pending = this.#loaded.get(family);
    if (pending === undefined) {
      pending = this.#load(family, known);
      this.#loaded.set(family, pending);
    }
    return pending;
  }

  async #load(family: string, font: BundledFont): Promise<boolean> {
    const set = fontSet();
    if (set === null) return false;
    try {
      await Promise.all(
        font.files.map(async (f) => {
          const face = new FontFace(family, `url("${this.#baseUrl}${f.file}")`, {
            weight:
              f.weight[0] === f.weight[1]
                ? String(f.weight[0])
                : `${String(f.weight[0])} ${String(f.weight[1])}`,
            style: f.italic ? "italic" : "normal",
          });
          await face.load();
          set.add(face);
        }),
      );
      return true;
    } catch {
      return false;
    }
  }
}
