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

export interface BuiltinLutInfo {
  id: string;
  name: string;
  description: string;
}

const LOOKS: { info: BuiltinLutInfo; look: Look }[] = [
  {
    info: {
      id: "builtin:teal-orange",
      name: "Teal & orange",
      description: "Cool teal shadows and warm orange highlights.",
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
    },
    look: (r, g, b) => [clamp(r * 0.94), clamp(g * 0.99), clamp(b * 1.07)],
  },
  {
    info: {
      id: "builtin:noir",
      name: "Noir",
      description: "High-contrast black and white.",
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
    },
    look: (r, g, b) => [
      clamp(0.393 * r + 0.769 * g + 0.189 * b),
      clamp(0.349 * r + 0.686 * g + 0.168 * b),
      clamp(0.272 * r + 0.534 * g + 0.131 * b),
    ],
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
