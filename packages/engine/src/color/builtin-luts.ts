import type { CubeLut } from "./cube.ts";

/** A look as a function on display-referred (sRGB-encoded) colour in [0, 1]. */
type Look = (r: number, g: number, b: number) => [number, number, number];

const clamp = (x: number): number => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const lumaOf = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const contrastAround = (x: number, amount: number): number => clamp(0.5 + (x - 0.5) * amount);
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const saturate = (r: number, g: number, b: number, amount: number): [number, number, number] => {
  const y = lumaOf(r, g, b);
  return [mix(y, r, amount), mix(y, g, amount), mix(y, b, amount)];
};

/** How built-in looks are grouped in pickers and on cards. */
export type LookGroup = "Cinematic" | "Film" | "Black & white" | "Colour & mood";

/** The groups in the order pickers show them. */
export const LOOK_GROUPS: readonly LookGroup[] = [
  "Cinematic",
  "Film",
  "Black & white",
  "Colour & mood",
];

export interface BuiltinLutInfo {
  id: string;
  name: string;
  description: string;
  group: LookGroup;
}

const LOOKS: { info: BuiltinLutInfo; look: Look }[] = [
  {
    info: {
      id: "builtin:teal-orange",
      name: "Teal & orange",
      description: "Cool teal shadows and warm orange highlights.",
      group: "Cinematic",
    },
    look: (r, g, b) => {
      const y = lumaOf(r, g, b);
      const shadows = 1 - smooth(0, 0.6, y);
      const highlights = smooth(0.4, 1, y);
      const [sr, sg, sb] = saturate(r, g, b, 1.1);
      return [
        contrastAround(sr - 0.06 * shadows + 0.07 * highlights, 1.08),
        contrastAround(sg + 0.015 * shadows + 0.01 * highlights, 1.08),
        contrastAround(sb + 0.07 * shadows - 0.07 * highlights, 1.08),
      ];
    },
  },
  {
    info: {
      id: "builtin:warm-film",
      name: "Warm film",
      description: "Soft contrast, lifted blacks and a warm cast.",
      group: "Film",
    },
    look: (r, g, b) => [
      mix(0.03, 0.98, contrastAround(r * 1.05, 0.95)),
      mix(0.03, 0.97, contrastAround(g, 0.95)),
      mix(0.04, 0.93, contrastAround(b * 0.92, 0.95)),
    ],
  },
  {
    info: {
      id: "builtin:cool-blue",
      name: "Cool blue",
      description: "A clean, cold daylight look.",
      group: "Colour & mood",
    },
    look: (r, g, b) => [clamp(r * 0.94), clamp(g * 0.99), clamp(b * 1.07)],
  },
  {
    info: {
      id: "builtin:noir",
      name: "Noir",
      description: "High-contrast black and white.",
      group: "Black & white",
    },
    look: (r, g, b) => {
      const y = contrastAround(lumaOf(r, g, b), 1.35);
      return [y, y, y];
    },
  },
  {
    info: {
      id: "builtin:bleach-bypass",
      name: "Bleach bypass",
      description: "Desaturated and gritty, with strong contrast.",
      group: "Cinematic",
    },
    look: (r, g, b) => {
      const [dr, dg, db] = saturate(r, g, b, 0.45);
      return [contrastAround(dr, 1.3), contrastAround(dg, 1.3), contrastAround(db, 1.3)];
    },
  },
  {
    info: {
      id: "builtin:faded",
      name: "Faded",
      description: "Washed-out blacks and muted colour.",
      group: "Film",
    },
    look: (r, g, b) => {
      const [dr, dg, db] = saturate(r, g, b, 0.8);
      return [mix(0.08, 0.92, dr), mix(0.08, 0.92, dg), mix(0.08, 0.92, db)];
    },
  },
  {
    info: {
      id: "builtin:vivid",
      name: "Vivid",
      description: "Punchy colour and contrast.",
      group: "Colour & mood",
    },
    look: (r, g, b) => {
      const [vr, vg, vb] = saturate(r, g, b, 1.35);
      return [contrastAround(vr, 1.1), contrastAround(vg, 1.1), contrastAround(vb, 1.1)];
    },
  },
  {
    info: {
      id: "builtin:sepia",
      name: "Sepia",
      description: "Classic brown-toned monochrome.",
      group: "Black & white",
    },
    look: (r, g, b) => [
      clamp(0.393 * r + 0.769 * g + 0.189 * b),
      clamp(0.349 * r + 0.686 * g + 0.168 * b),
      clamp(0.272 * r + 0.534 * g + 0.131 * b),
    ],
  },
  {
    info: {
      id: "builtin:blockbuster",
      name: "Blockbuster",
      description: "Bold teal shadows, glowing orange skin and hard contrast.",
      group: "Cinematic",
    },
    look: (r, g, b) => {
      const y = lumaOf(r, g, b);
      const shadows = 1 - smooth(0, 0.55, y);
      const highlights = smooth(0.35, 1, y);
      const [sr, sg, sb] = saturate(r, g, b, 1.15);
      return [
        contrastAround(sr - 0.09 * shadows + 0.1 * highlights, 1.18),
        contrastAround(sg + 0.02 * shadows + 0.03 * highlights, 1.18),
        contrastAround(sb + 0.1 * shadows - 0.1 * highlights, 1.18),
      ];
    },
  },
  {
    info: {
      id: "builtin:moonlight",
      name: "Moonlight",
      description: "Dim, desaturated blue night.",
      group: "Cinematic",
    },
    look: (r, g, b) => {
      const [dr, dg, db] = saturate(r, g, b, 0.55);
      return [
        contrastAround(dr * 0.8, 1.1) * 0.9,
        contrastAround(dg * 0.9, 1.1) * 0.9,
        clamp(contrastAround(db * 1.08 + 0.03, 1.1) * 0.95),
      ];
    },
  },
  {
    info: {
      id: "builtin:golden-hour",
      name: "Golden hour",
      description: "Warm, low sun with soft amber highlights.",
      group: "Cinematic",
    },
    look: (r, g, b) => {
      const highlights = smooth(0.3, 1, lumaOf(r, g, b));
      const [sr, sg, sb] = saturate(r, g, b, 1.1);
      return [
        clamp(0.02 + sr * 1.06 + 0.05 * highlights),
        clamp(0.015 + sg * 1.01 + 0.02 * highlights),
        clamp(0.01 + sb * 0.86 - 0.02 * highlights),
      ];
    },
  },
  {
    info: {
      id: "builtin:slide-film",
      name: "Slide film",
      description: "Rich, saturated colour and deep blacks, like reversal film.",
      group: "Film",
    },
    look: (r, g, b) => {
      const shadows = 1 - smooth(0, 0.5, lumaOf(r, g, b));
      const [vr, vg, vb] = saturate(r, g, b, 1.4);
      return [
        contrastAround(vr, 1.22),
        contrastAround(vg, 1.22),
        contrastAround(vb + 0.03 * shadows, 1.22),
      ];
    },
  },
  {
    info: {
      id: "builtin:cross-process",
      name: "Cross process",
      description: "Yellow-green highlights and blue shadows from mismatched chemistry.",
      group: "Film",
    },
    look: (r, g, b) => {
      const highlights = smooth(0.4, 1, lumaOf(r, g, b));
      return [
        clamp(contrastAround(r, 1.25) + 0.03),
        clamp(contrastAround(g, 1.15) + 0.04 * highlights),
        mix(0.14, 0.82, b),
      ];
    },
  },
  {
    info: {
      id: "builtin:super-8",
      name: "Super 8",
      description: "Warm home-movie colour with soft contrast and lifted blacks.",
      group: "Film",
    },
    look: (r, g, b) => {
      const [dr, dg, db] = saturate(r, g, b, 0.85);
      return [
        mix(0.06, 0.94, contrastAround(dr * 1.06, 0.88)),
        mix(0.06, 0.92, contrastAround(dg * 1.02, 0.88)),
        mix(0.05, 0.84, contrastAround(db * 0.88, 0.88)),
      ];
    },
  },
  {
    info: {
      id: "builtin:silver",
      name: "Silver",
      description: "Soft, neutral black and white.",
      group: "Black & white",
    },
    look: (r, g, b) => {
      const y = mix(0.06, 0.95, contrastAround(lumaOf(r, g, b), 1.05));
      return [y, y, y];
    },
  },
  {
    info: {
      id: "builtin:ink",
      name: "Ink",
      description: "Graphic black and white with crushed shadows.",
      group: "Black & white",
    },
    look: (r, g, b) => {
      const y = smooth(0.22, 0.78, lumaOf(r, g, b));
      return [y, y, y];
    },
  },
  {
    info: {
      id: "builtin:cyanotype",
      name: "Cyanotype",
      description: "Prussian-blue monochrome, like a sun print.",
      group: "Black & white",
    },
    look: (r, g, b) => {
      const y = contrastAround(lumaOf(r, g, b), 1.1);
      return [mix(0.04, 0.86, y), mix(0.14, 0.94, y), mix(0.3, 1, y)];
    },
  },
  {
    info: {
      id: "builtin:pastel",
      name: "Pastel",
      description: "Light, airy and softly tinted.",
      group: "Colour & mood",
    },
    look: (r, g, b) => {
      const [dr, dg, db] = saturate(r, g, b, 0.65);
      return [clamp(mix(0.16, 1, dr) + 0.03), mix(0.15, 0.98, dg), clamp(mix(0.17, 1, db) + 0.02)];
    },
  },
  {
    info: {
      id: "builtin:matte",
      name: "Matte",
      description: "Lifted blacks with full colour, a modern editorial finish.",
      group: "Colour & mood",
    },
    look: (r, g, b) => [
      mix(0.1, 0.97, contrastAround(r, 1.12)),
      mix(0.1, 0.97, contrastAround(g, 1.12)),
      mix(0.11, 0.96, contrastAround(b, 1.12)),
    ],
  },
  {
    info: {
      id: "builtin:sunset",
      name: "Sunset",
      description: "Magenta shadows fading into orange light.",
      group: "Colour & mood",
    },
    look: (r, g, b) => {
      const y = lumaOf(r, g, b);
      const shadows = 1 - smooth(0, 0.6, y);
      const highlights = smooth(0.4, 1, y);
      const [sr, sg, sb] = saturate(r, g, b, 1.15);
      return [
        clamp(sr + 0.05 * shadows + 0.08 * highlights),
        clamp(sg - 0.01 * shadows + 0.02 * highlights),
        clamp(sb + 0.06 * shadows - 0.07 * highlights),
      ];
    },
  },
];

export const BUILTIN_LUTS: readonly BuiltinLutInfo[] = LOOKS.map((l) => l.info);
export const isBuiltinLut = (lutId: string): boolean => lutId.startsWith("builtin:");

const SIZE = 17;
const cache = new Map<string, CubeLut>();

/** The built-in LUT as a 17³ cube (generated from its formula, so it needs no files and no licence). */
export function builtinLut(lutId: string): CubeLut | undefined {
  const cached = cache.get(lutId);
  if (cached !== undefined) return cached;
  const entry = LOOKS.find((l) => l.info.id === lutId);
  if (entry === undefined) return undefined;
  const data = new Float32Array(SIZE ** 3 * 3);
  let o = 0;
  for (let b = 0; b < SIZE; b++) {
    for (let g = 0; g < SIZE; g++) {
      for (let r = 0; r < SIZE; r++) {
        const [or, og, ob] = entry.look(r / (SIZE - 1), g / (SIZE - 1), b / (SIZE - 1));
        data[o++] = clamp(or);
        data[o++] = clamp(og);
        data[o++] = clamp(ob);
      }
    }
  }
  const lut: CubeLut = {
    title: entry.info.name,
    dimension: 3,
    size: SIZE,
    domainMin: [0, 0, 0],
    domainMax: [1, 1, 1],
    data,
  };
  cache.set(lutId, lut);
  return lut;
}
