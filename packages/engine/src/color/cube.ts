/** A parsed `.cube` look-up table (Adobe/Resolve format). Values are RGB triples in [domainMin, domainMax]. */
export interface CubeLut {
  title: string;
  /** 1: one curve per channel (LUT_1D_SIZE). 3: a cube (LUT_3D_SIZE). */
  dimension: 1 | 3;
  size: number;
  domainMin: [number, number, number];
  domainMax: [number, number, number];
  /** size entries (1D) or size³ entries (3D), red varying fastest; 3 numbers each. */
  data: Float32Array;
}

export class CubeError extends Error {
  override name = "CubeError";
}

const MAX_3D = 65;
const MAX_1D = 16384;

function numbers(parts: string[], count: number, line: number, what: string): number[] {
  if (parts.length !== count) {
    throw new CubeError(`Line ${String(line)}: ${what} needs ${String(count)} numbers.`);
  }
  return parts.map((p) => {
    const v = Number(p);
    if (!Number.isFinite(v)) throw new CubeError(`Line ${String(line)}: "${p}" isn't a number.`);
    return v;
  });
}

/**
 * Parses a `.cube` file strictly: every problem is reported with its line number rather than
 * guessed around. Supports TITLE, DOMAIN_MIN/MAX, LUT_1D_SIZE and LUT_3D_SIZE (not both).
 */
export function parseCube(text: string): CubeLut {
  let title = "";
  let dimension: 1 | 3 | null = null;
  let size = 0;
  let domainMin: [number, number, number] = [0, 0, 0];
  let domainMax: [number, number, number] = [1, 1, 1];
  const values: number[] = [];

  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  for (const [index, raw] of lines.entries()) {
    const lineNo = index + 1;
    const line = raw.replace(/#.*/, "").trim();
    if (line === "") continue;
    const parts = line.split(/\s+/);
    const keyword = parts[0] ?? "";
    if (/^[A-Za-z_]/.test(keyword)) {
      switch (keyword) {
        case "TITLE":
          title = line.slice(5).trim().replace(/^"|"$/g, "");
          continue;
        case "DOMAIN_MIN": {
          const [r, g, b] = numbers(parts.slice(1), 3, lineNo, "DOMAIN_MIN");
          domainMin = [r ?? 0, g ?? 0, b ?? 0];
          continue;
        }
        case "DOMAIN_MAX": {
          const [r, g, b] = numbers(parts.slice(1), 3, lineNo, "DOMAIN_MAX");
          domainMax = [r ?? 1, g ?? 1, b ?? 1];
          continue;
        }
        case "LUT_1D_SIZE":
        case "LUT_3D_SIZE": {
          if (dimension !== null) {
            throw new CubeError(`Line ${String(lineNo)}: a file can hold one table, not two.`);
          }
          const [n] = numbers(parts.slice(1), 1, lineNo, keyword);
          const limit = keyword === "LUT_3D_SIZE" ? MAX_3D : MAX_1D;
          if (n === undefined || !Number.isInteger(n) || n < 2 || n > limit) {
            throw new CubeError(
              `Line ${String(lineNo)}: ${keyword} must be a whole number from 2 to ${String(limit)}.`,
            );
          }
          dimension = keyword === "LUT_3D_SIZE" ? 3 : 1;
          size = n;
          continue;
        }
        default:
          throw new CubeError(`Line ${String(lineNo)}: unknown keyword "${keyword}".`);
      }
    }
    values.push(...numbers(parts, 3, lineNo, "A table row"));
  }

  if (dimension === null) throw new CubeError("The file has no LUT_1D_SIZE or LUT_3D_SIZE line.");
  const entries = dimension === 3 ? size ** 3 : size;
  if (values.length !== entries * 3) {
    throw new CubeError(
      `Expected ${String(entries)} table rows for size ${String(size)}, found ${String(values.length / 3)}.`,
    );
  }
  for (let c = 0; c < 3; c++) {
    if (!((domainMax[c] ?? 1) > (domainMin[c] ?? 0))) {
      throw new CubeError("DOMAIN_MAX must be larger than DOMAIN_MIN on every channel.");
    }
  }
  return { title, dimension, size, domainMin, domainMax, data: Float32Array.from(values) };
}

/**
 * Expands a 1D LUT into an N×N×N cube whose channels each go through their own curve, so one
 * code path (a 3D texture) serves both kinds.
 */
export function to3d(lut: CubeLut, cubeSize = 33): CubeLut {
  if (lut.dimension === 3) return lut;
  const n = cubeSize;
  const out = new Float32Array(n * n * n * 3);
  const sample = (channel: number, x: number): number => {
    const f = Math.min(1, Math.max(0, x)) * (lut.size - 1);
    const i = Math.min(lut.size - 2, Math.floor(f));
    const t = f - i;
    const a = lut.data[i * 3 + channel] ?? 0;
    const b = lut.data[(i + 1) * 3 + channel] ?? a;
    return a + (b - a) * t;
  };
  let o = 0;
  for (let b = 0; b < n; b++) {
    for (let g = 0; g < n; g++) {
      for (let r = 0; r < n; r++) {
        out[o++] = sample(0, r / (n - 1));
        out[o++] = sample(1, g / (n - 1));
        out[o++] = sample(2, b / (n - 1));
      }
    }
  }
  return { ...lut, dimension: 3, size: n, data: out };
}

/** Trilinear lookup of a 3D LUT at input rgb in [0, 1] (the texture sampler's behaviour). */
export function lookup3d(
  lut: CubeLut,
  rgb: readonly [number, number, number],
): [number, number, number] {
  const n = lut.size;
  const pos = rgb.map((v, c) => {
    const lo = lut.domainMin[c] ?? 0;
    const hi = lut.domainMax[c] ?? 1;
    return Math.min(1, Math.max(0, (v - lo) / (hi - lo))) * (n - 1);
  });
  const [px = 0, py = 0, pz = 0] = pos;
  const x0 = Math.min(n - 2, Math.floor(px));
  const y0 = Math.min(n - 2, Math.floor(py));
  const z0 = Math.min(n - 2, Math.floor(pz));
  const fx = px - x0;
  const fy = py - y0;
  const fz = pz - z0;
  const at = (x: number, y: number, z: number, c: number): number =>
    lut.data[((z * n + y) * n + x) * 3 + c] ?? 0;
  const result: [number, number, number] = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
    const c00 = lerp(at(x0, y0, z0, c), at(x0 + 1, y0, z0, c), fx);
    const c10 = lerp(at(x0, y0 + 1, z0, c), at(x0 + 1, y0 + 1, z0, c), fx);
    const c01 = lerp(at(x0, y0, z0 + 1, c), at(x0 + 1, y0, z0 + 1, c), fx);
    const c11 = lerp(at(x0, y0 + 1, z0 + 1, c), at(x0 + 1, y0 + 1, z0 + 1, c), fx);
    result[c] = lerp(lerp(c00, c10, fy), lerp(c01, c11, fy), fz);
  }
  return result;
}
