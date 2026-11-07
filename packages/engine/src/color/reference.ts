/**
 * The colour grade, step by step, in plain TypeScript. This is the specification of
 * `gl/shaders/color.frag.glsl` (docs/color.md): the shader is tested against this function, so a
 * change to the grade changes both. All values are linear Rec. 709 / sRGB-primaries RGB.
 */
import type { ColorSettings, Vec2 } from "@lumacut/schema";
import { lookupCurve, type CurveRow } from "./curves.ts";
import { lookup3d, type CubeLut } from "./cube.ts";

export type Rgb = [number, number, number];

const LUMA: Rgb = [0.2126, 0.7152, 0.0722];
const PIVOT = 0.18; // mid-grey in linear light
const ROW: Record<CurveRow, number> = {
  master: 0,
  r: 1,
  g: 2,
  b: 3,
  hueVsSat: 4,
  hueVsHue: 5,
  lumVsSat: 6,
};

export const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const luma = (c: Rgb): number => c[0] * LUMA[0] + c[1] * LUMA[1] + c[2] * LUMA[2];

export const toSrgb = (x: number): number => {
  const v = Math.max(0, x);
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
};
export const toLinear = (x: number): number =>
  x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);

// --- Hue/saturation/lightness ------------------------------------------------------------------

export function rgbToHsl([r, g, b]: Rgb): Rgb {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d < 1e-9) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

export function hslToRgb([h, s, l]: Rgb): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const f = (n: number): number => {
    const k = (n + h * 12) % 12;
    return l - (c / 2) * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return [f(0), f(8), f(4)];
}

// --- The steps ---------------------------------------------------------------------------------

export const BAND_HUES = [0, 30, 60, 120, 180, 240, 270, 300] as const; // degrees
const BAND_NAMES = [
  "red",
  "orange",
  "yellow",
  "green",
  "aqua",
  "blue",
  "purple",
  "magenta",
] as const;

/** Temperature (warm > 0) and tint (magenta > 0) as per-channel gains. ±100 is ±0.5 stop. */
export function whiteBalance(c: Rgb, temperature: number, tint: number): Rgb {
  const t = temperature * 0.005;
  const m = tint * 0.005;
  return [c[0] * 2 ** t, c[1] * 2 ** -m, c[2] * 2 ** -t];
}

export function exposure(c: Rgb, stops: number): Rgb {
  const g = 2 ** stops;
  return [c[0] * g, c[1] * g, c[2] * g];
}

/** Contrast about mid-grey; highlights/shadows/whites as gains by tonal region, blacks as an offset. */
export function tone(
  c: Rgb,
  contrast: number,
  highlights: number,
  shadows: number,
  whites: number,
  blacks: number,
): Rgb {
  const k = Math.max(0.01, 1 + contrast);
  let out = c.map((v) => PIVOT * Math.pow(Math.max(v, 0) / PIVOT, k)) as Rgb;
  const l = Math.pow(clamp01(luma(out)), 1 / 2.2);
  const shadowW = 1 - smoothstep(0, 0.5, l);
  const highlightW = smoothstep(0.5, 1, l);
  const blackW = 1 - smoothstep(0, 0.25, l);
  const whiteW = smoothstep(0.75, 1, l);
  const gain = 2 ** (shadows * shadowW + highlights * highlightW + whites * whiteW);
  out = out.map((v) => v * gain + blacks * 0.04 * blackW) as Rgb;
  return out;
}

/** Gain, then offset, then lift (strongest in the shadows), then gamma. Neutral at 0. */
export function wheels(c: Rgb, lift: Rgb, gamma: Rgb, gain: Rgb, offset: Rgb): Rgb {
  const out: Rgb = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    let v = (c[i] ?? 0) * (1 + (gain[i] ?? 0));
    v += (offset[i] ?? 0) * 0.1;
    v += (lift[i] ?? 0) * 0.1 * (1 - clamp01(v));
    const g = 1 + (gamma[i] ?? 0);
    v = Math.pow(Math.max(v, 0), 1 / Math.max(g, 0.05));
    out[i] = v;
  }
  return out;
}

export interface GradeParams {
  settings: ColorSettings;
  /** 7 × 256 table from `curveTable` (see curves.ts); undefined means no curves. */
  curves?: Float32Array | undefined;
  lut?: CubeLut | undefined;
}

function bandWeights(hueDeg: number): number[] {
  return BAND_HUES.map((center) => {
    const d = Math.abs(((hueDeg - center + 540) % 360) - 180);
    return Math.max(0, 1 - d / 45);
  });
}

/** Curves and HSL bands act on display-referred (sRGB-encoded) values, like the tools people know. */
function curvesAndBands(c: Rgb, params: GradeParams): Rgb {
  const { settings, curves } = params;
  const bands = settings.hsl;
  if (curves === undefined && bands === undefined) return c;
  let e: Rgb = [clamp01(toSrgb(c[0])), clamp01(toSrgb(c[1])), clamp01(toSrgb(c[2]))];
  if (curves !== undefined) {
    // Per-channel curves first, then the master curve on each channel.
    e = [
      lookupCurve(curves, ROW.master, lookupCurve(curves, ROW.r, e[0])),
      lookupCurve(curves, ROW.master, lookupCurve(curves, ROW.g, e[1])),
      lookupCurve(curves, ROW.master, lookupCurve(curves, ROW.b, e[2])),
    ];
  }
  let [h, s, l] = rgbToHsl(e);
  if (curves !== undefined) {
    const sat = lookupCurve(curves, ROW.hueVsSat, h) * 2;
    const hue = lookupCurve(curves, ROW.hueVsHue, h) - 0.5;
    const lum = lookupCurve(curves, ROW.lumVsSat, l) * 2;
    const live = smoothstep(0.02, 0.2, s);
    s = clamp01(s * (1 + (sat - 1) * live) * (1 + (lum - 1)));
    h = (((h + hue * live) % 1) + 1) % 1;
  }
  if (bands !== undefined) {
    const w = bandWeights(h * 360);
    const live = smoothstep(0.02, 0.2, s);
    let dh = 0;
    let ds = 0;
    let dl = 0;
    BAND_NAMES.forEach((name, i) => {
      const band = bands[name];
      const weight = (w[i] ?? 0) * live;
      dh += weight * band.hue;
      ds += weight * band.saturation;
      dl += weight * band.luminance;
    });
    h = (((h + (dh * 30) / 360) % 1) + 1) % 1;
    s = clamp01(s * (1 + ds));
    l = clamp01(l + dl * 0.2);
  }
  e = hslToRgb([h, s, l]);
  return [toLinear(e[0]), toLinear(e[1]), toLinear(e[2])];
}

export function saturationVibrance(c: Rgb, saturation: number, vibrance: number): Rgb {
  const y = luma(c);
  const encoded: Rgb = [clamp01(toSrgb(c[0])), clamp01(toSrgb(c[1])), clamp01(toSrgb(c[2]))];
  const chroma = Math.max(...encoded) - Math.min(...encoded);
  const amount = 1 + saturation + vibrance * (1 - chroma);
  return c.map((v) => y + (v - y) * amount) as Rgb;
}

function applyLut(c: Rgb, lut: CubeLut, intensity: number): Rgb {
  const encoded: Rgb = [clamp01(toSrgb(c[0])), clamp01(toSrgb(c[1])), clamp01(toSrgb(c[2]))];
  const mapped = lookup3d(lut, encoded);
  const linear: Rgb = [toLinear(mapped[0]), toLinear(mapped[1]), toLinear(mapped[2])];
  return c.map((v, i) => v + ((linear[i] ?? v) - v) * intensity) as Rgb;
}

/** The whole grade for one straight (unpremultiplied) linear colour. */
export function gradeColor(c: Rgb, params: GradeParams): Rgb {
  const s = params.settings;
  let out = whiteBalance(c, s.temperature, s.tint);
  out = exposure(out, s.exposure);
  out = tone(out, s.contrast, s.highlights, s.shadows, s.whites, s.blacks);
  out = wheels(out, s.lift, s.gamma, s.gain, s.offset);
  out = curvesAndBands(out, params);
  out = saturationVibrance(out, s.saturation, s.vibrance);
  if (params.lut !== undefined && s.lut !== undefined && s.lut.intensity > 0) {
    out = applyLut(out, params.lut, s.lut.intensity);
  }
  return out;
}

export type { Vec2 };
