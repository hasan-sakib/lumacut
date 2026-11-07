/**
 * Video scopes from a small picture. The input is what the viewer sees (8-bit sRGB values, top-left
 * origin, premultiplied over an opaque background so alpha is irrelevant); every scope is a count
 * of pixels per bin, which the page turns into brightness. Pure functions: easy to test exactly.
 */
export interface ScopeSample {
  width: number;
  height: number;
  /** RGBA8, top-left origin. */
  pixels: Uint8Array;
}

export type Channel = "luma" | "r" | "g" | "b";

const LEVELS = 256;
const clampByte = (v: number): number => Math.min(255, Math.max(0, Math.round(v)));
/** Rec. 709 luma of 8-bit values, in 0..255. */
export const lumaOf = (r: number, g: number, b: number): number =>
  0.2126 * r + 0.7152 * g + 0.0722 * b;

function value(sample: ScopeSample, index: number, channel: Channel): number {
  const r = sample.pixels[index] ?? 0;
  const g = sample.pixels[index + 1] ?? 0;
  const b = sample.pixels[index + 2] ?? 0;
  if (channel === "r") return r;
  if (channel === "g") return g;
  if (channel === "b") return b;
  return clampByte(lumaOf(r, g, b));
}

export interface Histogram {
  r: Uint32Array;
  g: Uint32Array;
  b: Uint32Array;
  luma: Uint32Array;
  /** The count of the fullest bin (for scaling). */
  max: number;
}

export function histogram(sample: ScopeSample): Histogram {
  const r = new Uint32Array(LEVELS);
  const g = new Uint32Array(LEVELS);
  const b = new Uint32Array(LEVELS);
  const luma = new Uint32Array(LEVELS);
  for (let i = 0; i + 3 < sample.pixels.length; i += 4) {
    const pr = sample.pixels[i] ?? 0;
    const pg = sample.pixels[i + 1] ?? 0;
    const pb = sample.pixels[i + 2] ?? 0;
    r[pr] = (r[pr] ?? 0) + 1;
    g[pg] = (g[pg] ?? 0) + 1;
    b[pb] = (b[pb] ?? 0) + 1;
    const y = clampByte(lumaOf(pr, pg, pb));
    luma[y] = (luma[y] ?? 0) + 1;
  }
  const max = Math.max(...r, ...g, ...b, ...luma);
  return { r, g, b, luma, max };
}

export interface Waveform {
  /** Output columns. */
  width: number;
  /** 256 levels, level 255 at the top row. */
  height: number;
  /** counts[row * width + column]; row 0 is level 255. */
  counts: Uint32Array;
  max: number;
}

/**
 * A waveform: each column of the output holds the distribution of one channel's values over the
 * picture columns that fall into it. `columns` is the output width (the sample's width by default).
 */
export function waveform(sample: ScopeSample, channel: Channel, columns = sample.width): Waveform {
  const counts = new Uint32Array(columns * LEVELS);
  for (let y = 0; y < sample.height; y++) {
    for (let x = 0; x < sample.width; x++) {
      const level = value(sample, (y * sample.width + x) * 4, channel);
      // One picture column maps to one output column, or to several when the output is wider
      // (so a small sample still draws a continuous trace).
      const first = Math.floor((x * columns) / sample.width);
      const last = Math.max(first + 1, Math.floor(((x + 1) * columns) / sample.width));
      const row = LEVELS - 1 - level;
      for (let column = first; column < Math.min(columns, last); column++) {
        const at = row * columns + column;
        counts[at] = (counts[at] ?? 0) + 1;
      }
    }
  }
  return { width: columns, height: LEVELS, counts, max: Math.max(0, ...counts) };
}

/** RGB parade: the three channels' waveforms side by side, each a third of `columns`. */
export function parade(
  sample: ScopeSample,
  columns = sample.width,
): { r: Waveform; g: Waveform; b: Waveform } {
  const each = Math.max(1, Math.floor(columns / 3));
  return {
    r: waveform(sample, "r", each),
    g: waveform(sample, "g", each),
    b: waveform(sample, "b", each),
  };
}

export interface Vectorscope {
  /** Square grid size; x is Cb (blue-difference), y is Cr (red-difference), up is more red. */
  size: number;
  counts: Uint32Array;
  max: number;
}

/**
 * The Cb/Cr plane (Rec. 709) as a size×size histogram. Bins are centred on a grid of `size` points,
 * so with an odd size neutral greys land exactly on the centre bin instead of straddling a boundary.
 */
export function vectorscope(sample: ScopeSample, size = 255): Vectorscope {
  const counts = new Uint32Array(size * size);
  for (let i = 0; i + 3 < sample.pixels.length; i += 4) {
    const r = sample.pixels[i] ?? 0;
    const g = sample.pixels[i + 1] ?? 0;
    const b = sample.pixels[i + 2] ?? 0;
    const y = lumaOf(r, g, b);
    const cb = (b - y) / 255 / 1.8556; // -0.5 .. 0.5
    const cr = (r - y) / 255 / 1.5748;
    const x = Math.min(size - 1, Math.max(0, Math.round((cb + 0.5) * (size - 1))));
    const row = Math.min(size - 1, Math.max(0, Math.round((0.5 - cr) * (size - 1))));
    const at = row * size + x;
    counts[at] = (counts[at] ?? 0) + 1;
  }
  return { size, counts, max: Math.max(0, ...counts) };
}

/** Where a colour lands on the vectorscope (for the graticule), as 0..1 fractions of the grid: bin = round(fraction × (size − 1)). */
export function vectorscopeTarget(r: number, g: number, b: number): { x: number; y: number } {
  const y = lumaOf(r, g, b);
  return { x: (b - y) / 255 / 1.8556 + 0.5, y: 0.5 - (r - y) / 255 / 1.5748 };
}
