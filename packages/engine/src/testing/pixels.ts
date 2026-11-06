/** Small helpers for comparing rendered pixels. */

/** Order-sensitive 64-bit-ish fingerprint (two 32-bit FNV-1a lanes) as a hex string. */
export function hashPixels(data: ArrayLike<number>): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ 0xdeadbeef;
  for (let i = 0; i < data.length; i += 1) {
    const v = data[i] ?? 0;
    h1 = Math.imul(h1 ^ v, 0x01000193);
    h2 = Math.imul(h2 ^ (v + i), 0x85ebca6b);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, "0")}${(h2 >>> 0).toString(16).padStart(8, "0")}`;
}

/** Largest absolute difference of any channel of any pixel. */
export function maxChannelDiff(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length) throw new RangeError("Images differ in size");
  let max = 0;
  for (let i = 0; i < a.length; i += 1) max = Math.max(max, Math.abs((a[i] ?? 0) - (b[i] ?? 0)));
  return max;
}

/** One pixel as [r, g, b, a] from RGBA data (top-left origin). */
export function pixelAt(
  rgba: ArrayLike<number>,
  width: number,
  x: number,
  y: number,
): [number, number, number, number] {
  const i = (y * width + x) * 4;
  return [rgba[i] ?? 0, rgba[i + 1] ?? 0, rgba[i + 2] ?? 0, rgba[i + 3] ?? 0];
}
