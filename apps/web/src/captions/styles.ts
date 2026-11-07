import type { CaptionData, Color, Composition, TextData } from "@lumacut/schema";

export interface CaptionStyle {
  id: string;
  name: string;
  description: string;
  fontFamily: string;
  fontWeight: number;
  italic: boolean;
  /** Font size as a fraction of the composition height. */
  size: number;
  color: Color;
  highlight?: Color;
  stroke?: { color: Color; width: number };
  shadow?: { color: Color; offset: [number, number]; blur: number };
  background?: { color: Color; padding: number; cornerRadius: number };
  maxLines: number;
  maxCharsPerLine: number;
}

const c = (hex: string, a = 1): Color => {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a };
};

export const CAPTION_STYLES: readonly CaptionStyle[] = [
  {
    id: "classic",
    name: "Classic",
    description: "White text with a soft shadow, like subtitles.",
    fontFamily: "Inter",
    fontWeight: 600,
    italic: false,
    size: 0.05,
    color: c("#ffffff"),
    shadow: { color: c("#000000", 0.7), offset: [0, 3], blur: 6 },
    maxLines: 2,
    maxCharsPerLine: 36,
  },
  {
    id: "karaoke",
    name: "Karaoke",
    description: "Bold words that light up yellow as they are spoken.",
    fontFamily: "Poppins",
    fontWeight: 700,
    italic: false,
    size: 0.06,
    color: c("#ffffff"),
    highlight: c("#ffd60a"),
    stroke: { color: c("#000000"), width: 4 },
    maxLines: 2,
    maxCharsPerLine: 28,
  },
  {
    id: "pop",
    name: "Pop",
    description: "Heavy outlined lettering for short, punchy reels.",
    fontFamily: "Montserrat",
    fontWeight: 900,
    italic: false,
    size: 0.075,
    color: c("#ffffff"),
    highlight: c("#ff3b6b"),
    stroke: { color: c("#000000"), width: 6 },
    maxLines: 2,
    maxCharsPerLine: 18,
  },
  {
    id: "boxed",
    name: "Boxed",
    description: "White text on a rounded dark box.",
    fontFamily: "Inter",
    fontWeight: 600,
    italic: false,
    size: 0.05,
    color: c("#ffffff"),
    background: { color: c("#000000", 0.65), padding: 14, cornerRadius: 12 },
    maxLines: 2,
    maxCharsPerLine: 32,
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Small, light and quiet.",
    fontFamily: "Inter",
    fontWeight: 400,
    italic: false,
    size: 0.04,
    color: c("#f5f5f5"),
    shadow: { color: c("#000000", 0.5), offset: [0, 2], blur: 4 },
    maxLines: 2,
    maxCharsPerLine: 44,
  },
  {
    id: "neon",
    name: "Neon",
    description: "Tall condensed letters with a cyan glow.",
    fontFamily: "Bebas Neue",
    fontWeight: 400,
    italic: false,
    size: 0.075,
    color: c("#e9fdff"),
    highlight: c("#00e5ff"),
    shadow: { color: c("#00e5ff", 0.9), offset: [0, 0], blur: 14 },
    maxLines: 2,
    maxCharsPerLine: 26,
  },
  {
    id: "serif",
    name: "Editorial",
    description: "Elegant italic serif.",
    fontFamily: "Playfair Display",
    fontWeight: 500,
    italic: true,
    size: 0.055,
    color: c("#ffffff"),
    shadow: { color: c("#000000", 0.6), offset: [0, 3], blur: 8 },
    maxLines: 2,
    maxCharsPerLine: 34,
  },
  {
    id: "handwritten",
    name: "Handwritten",
    description: "Casual marker lettering.",
    fontFamily: "Caveat",
    fontWeight: 700,
    italic: false,
    size: 0.07,
    color: c("#fff6c2"),
    highlight: c("#ff8fab"),
    shadow: { color: c("#000000", 0.6), offset: [0, 3], blur: 5 },
    maxLines: 2,
    maxCharsPerLine: 30,
  },
];

export const captionStyleById = (id: string): CaptionStyle | undefined =>
  CAPTION_STYLES.find((s) => s.id === id);

/** The `text` and `caption` fields for a caption clip in this style (words and timing are kept). */
export function applyCaptionStyle(
  style: CaptionStyle,
  comp: Pick<Composition, "height">,
  caption: CaptionData,
): { text: TextData; caption: CaptionData } {
  const text: TextData = {
    runs: [
      {
        text: "",
        fontFamily: style.fontFamily,
        fontWeight: style.fontWeight,
        fontSize: Math.max(10, Math.round(comp.height * style.size)),
        color: style.color,
        italic: style.italic,
        underline: false,
      },
    ],
    align: "center",
    lineHeight: 1.25,
    tracking: 0,
    ...(style.stroke === undefined ? {} : { stroke: style.stroke }),
    ...(style.shadow === undefined ? {} : { shadow: style.shadow }),
    ...(style.background === undefined ? {} : { background: style.background }),
    animators: [],
  };
  const { highlightColor: _old, ...rest } = caption;
  return {
    text,
    caption: {
      ...rest,
      styleId: style.id,
      ...(style.highlight === undefined ? {} : { highlightColor: style.highlight }),
      maxLines: style.maxLines,
      maxCharsPerLine: style.maxCharsPerLine,
    },
  };
}
