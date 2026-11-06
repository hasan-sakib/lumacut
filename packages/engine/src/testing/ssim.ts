/**
 * Structural similarity (SSIM) between two RGBA images, computed on Rec. 601 luma with 8x8
 * windows every 4 pixels. Used by the render smoke test and, in M8, by the browser-vs-server
 * export parity test (SSIM >= 0.98).
 */
const C1 = (0.01 * 255) ** 2;
const C2 = (0.03 * 255) ** 2;
const WINDOW = 8;
const STRIDE = 4;

function luma(rgba: ArrayLike<number>, pixels: number): Float64Array {
  const out = new Float64Array(pixels);
  for (let i = 0; i < pixels; i += 1) {
    out[i] =
      0.299 * (rgba[i * 4] ?? 0) + 0.587 * (rgba[i * 4 + 1] ?? 0) + 0.114 * (rgba[i * 4 + 2] ?? 0);
  }
  return out;
}

export function ssim(
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  width: number,
  height: number,
): number {
  if (width < WINDOW || height < WINDOW) throw new RangeError("Images must be at least 8x8");
  const ya = luma(a, width * height);
  const yb = luma(b, width * height);
  const n = WINDOW * WINDOW;
  let total = 0;
  let windows = 0;
  for (let y0 = 0; y0 + WINDOW <= height; y0 += STRIDE) {
    for (let x0 = 0; x0 + WINDOW <= width; x0 += STRIDE) {
      let sa = 0;
      let sb = 0;
      let saa = 0;
      let sbb = 0;
      let sab = 0;
      for (let y = y0; y < y0 + WINDOW; y += 1) {
        const row = y * width;
        for (let x = x0; x < x0 + WINDOW; x += 1) {
          const va = ya[row + x] ?? 0;
          const vb = yb[row + x] ?? 0;
          sa += va;
          sb += vb;
          saa += va * va;
          sbb += vb * vb;
          sab += va * vb;
        }
      }
      const ma = sa / n;
      const mb = sb / n;
      const varA = saa / n - ma * ma;
      const varB = sbb / n - mb * mb;
      const cov = sab / n - ma * mb;
      total +=
        ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (varA + varB + C2));
      windows += 1;
    }
  }
  return total / windows;
}
