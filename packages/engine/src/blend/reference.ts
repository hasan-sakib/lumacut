/**
 * Pure TypeScript blend modes: the oracle the GPU shader is tested against.
 *
 * Colours are straight (non-premultiplied) floats in [0, 1] in the compositing space. Separable
 * modes and the four non-separable ones follow the W3C Compositing and Blending spec; the others
 * (linearBurn, add, vividLight, linearLight, pinLight, hardMix, subtract, divide) follow the
 * Photoshop / After Effects definitions.
 */
import type { BlendMode } from "@lumacut/schema";

export type Rgb = readonly [number, number, number];
export type Rgba = readonly [number, number, number, number];

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

const multiply = (cb: number, cs: number): number => cb * cs;
const screen = (cb: number, cs: number): number => cb + cs - cb * cs;

function colorDodge(cb: number, cs: number): number {
  if (cb === 0) return 0;
  if (cs >= 1) return 1;
  return Math.min(1, cb / (1 - cs));
}

function colorBurn(cb: number, cs: number): number {
  if (cb >= 1) return 1;
  if (cs <= 0) return 0;
  return 1 - Math.min(1, (1 - cb) / cs);
}

function hardLight(cb: number, cs: number): number {
  return cs <= 0.5 ? multiply(cb, 2 * cs) : screen(cb, 2 * cs - 1);
}

function softLight(cb: number, cs: number): number {
  if (cs <= 0.5) return cb - (1 - 2 * cs) * cb * (1 - cb);
  const d = cb <= 0.25 ? ((16 * cb - 12) * cb + 4) * cb : Math.sqrt(cb);
  return cb + (2 * cs - 1) * (d - cb);
}

function vividLight(cb: number, cs: number): number {
  return cs < 0.5 ? colorBurn(cb, 2 * cs) : colorDodge(cb, 2 * (cs - 0.5));
}

function pinLight(cb: number, cs: number): number {
  return cs < 0.5 ? Math.min(cb, 2 * cs) : Math.max(cb, 2 * (cs - 0.5));
}

type SeparableMode = Exclude<BlendMode, "hue" | "saturation" | "color" | "luminosity">;

const SEPARABLE: Record<SeparableMode, (cb: number, cs: number) => number> = {
  normal: (_cb, cs) => cs,
  darken: Math.min,
  multiply,
  colorBurn,
  linearBurn: (cb, cs) => Math.max(0, cb + cs - 1),
  lighten: Math.max,
  screen,
  colorDodge,
  add: (cb, cs) => Math.min(1, cb + cs),
  overlay: (cb, cs) => hardLight(cs, cb),
  softLight,
  hardLight,
  vividLight,
  linearLight: (cb, cs) => clamp01(cb + 2 * cs - 1),
  pinLight,
  hardMix: (cb, cs) => (cb + cs >= 1 ? 1 : 0),
  difference: (cb, cs) => Math.abs(cb - cs),
  exclusion: (cb, cs) => cb + cs - 2 * cb * cs,
  subtract: (cb, cs) => Math.max(0, cb - cs),
  divide: (cb, cs) => (cs === 0 ? 1 : Math.min(1, cb / cs)),
};

const lum = (c: Rgb): number => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
const sat = (c: Rgb): number => Math.max(...c) - Math.min(...c);

function clipColor(c: Rgb): Rgb {
  const l = lum(c);
  const n = Math.min(...c);
  const x = Math.max(...c);
  let out: Rgb = c;
  if (n < 0) out = out.map((v) => l + ((v - l) * l) / (l - n)) as unknown as Rgb;
  if (x > 1) out = out.map((v) => l + ((v - l) * (1 - l)) / (x - l)) as unknown as Rgb;
  return out;
}

function setLum(c: Rgb, l: number): Rgb {
  const d = l - lum(c);
  return clipColor([c[0] + d, c[1] + d, c[2] + d]);
}

function setSat(c: Rgb, s: number): Rgb {
  const order = [0, 1, 2].sort((i, j) => (c[i] ?? 0) - (c[j] ?? 0)) as [number, number, number];
  const [iMin, iMid, iMax] = order;
  const min = c[iMin] ?? 0;
  const mid = c[iMid] ?? 0;
  const max = c[iMax] ?? 0;
  const out: [number, number, number] = [0, 0, 0];
  if (max > min) {
    out[iMid] = ((mid - min) * s) / (max - min);
    out[iMax] = s;
  }
  return out;
}

/** B(cb, cs): the blend function of one mode on two straight RGB colours. */
export function blendRgb(mode: BlendMode, cb: Rgb, cs: Rgb): Rgb {
  switch (mode) {
    case "hue":
      return setLum(setSat(cs, sat(cb)), lum(cb));
    case "saturation":
      return setLum(setSat(cb, sat(cs)), lum(cb));
    case "color":
      return setLum(cs, lum(cb));
    case "luminosity":
      return setLum(cb, lum(cs));
    default: {
      const f = SEPARABLE[mode];
      return [f(cb[0], cs[0]), f(cb[1], cs[1]), f(cb[2], cs[2])];
    }
  }
}

/**
 * Composites `source` (with extra `opacity`) over `backdrop` using `mode`, returning a straight
 * RGBA colour (W3C general compositing formula, source-over).
 */
export function compositePixel(mode: BlendMode, backdrop: Rgba, source: Rgba, opacity = 1): Rgba {
  const ab = backdrop[3];
  const as = source[3] * opacity;
  const cb: Rgb = [backdrop[0], backdrop[1], backdrop[2]];
  const cs: Rgb = [source[0], source[1], source[2]];
  const blended = blendRgb(mode, cb, cs);
  const ao = as + ab * (1 - as);
  if (ao <= 0) return [0, 0, 0, 0];
  const channel = (i: 0 | 1 | 2): number => {
    const premult = as * (1 - ab) * cs[i] + as * ab * blended[i] + (1 - as) * ab * cb[i];
    return premult / ao;
  };
  return [channel(0), channel(1), channel(2), ao];
}
