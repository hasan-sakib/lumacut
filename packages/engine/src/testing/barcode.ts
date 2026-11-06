/**
 * Frame-number barcode burned into the sample videos and fixtures (see
 * services/worker/lumacut_worker/samples/barcode.py, which is the encoder and the contract).
 *
 * Layout, bottom strip of the frame (1/12 of its height), 18 equal cells: cell 0 white (start
 * marker), cells 1..16 the frame number MSB first (white = 1), cell 17 black (end marker).
 * `barcode-vectors.json` is generated from the Python encoder and checked on both sides.
 */
export const BARCODE_CELLS = 18;
export const BARCODE_BITS = 16;
const STRIP_FRACTION = 1 / 12;
const WHITE = 255;
const BLACK = 0;
const THRESHOLD = 128;

/** Python's round(): halves go to the even neighbour. Matches the encoder's strip height. */
function roundHalfEven(x: number): number {
  const floor = Math.floor(x);
  const diff = x - floor;
  if (diff < 0.5) return floor;
  if (diff > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

/** Strip height in pixels (even, so it survives 4:2:0 chroma subsampling). */
export function barcodeStripHeight(frameHeight: number): number {
  return Math.max(2, Math.floor(roundHalfEven(frameHeight * STRIP_FRACTION) / 2) * 2);
}

/** Reference encoder for one row of luma samples (used by tests; the real encoder is Python). */
export function encodeBarcodeRow(frame: number, width: number): Uint8Array {
  if (!Number.isInteger(frame) || frame < 0 || frame >= 2 ** BARCODE_BITS) {
    throw new RangeError(`frame ${String(frame)} does not fit in ${String(BARCODE_BITS)} bits`);
  }
  const row = new Uint8Array(width);
  for (let x = 0; x < width; x += 1) {
    const cell = Math.floor((x * BARCODE_CELLS) / width);
    if (cell === 0) row[x] = WHITE;
    else if (cell === BARCODE_CELLS - 1) row[x] = BLACK;
    else row[x] = (frame >> (BARCODE_BITS - cell)) & 1 ? WHITE : BLACK;
  }
  return row;
}

/**
 * Reads the frame number from one row. `sample(x)` returns the luma-like value (0..255) at
 * column x. Returns null if the start/end markers aren't found (not a barcode frame).
 */
export function decodeBarcodeRow(width: number, sample: (x: number) => number): number | null {
  const bit = (cell: number): boolean =>
    sample(Math.floor(((cell + 0.5) * width) / BARCODE_CELLS)) >= THRESHOLD;
  if (!bit(0) || bit(BARCODE_CELLS - 1)) return null;
  let value = 0;
  for (let cell = 1; cell <= BARCODE_BITS; cell += 1) value = (value << 1) | (bit(cell) ? 1 : 0);
  return value;
}

export type PixelOrigin = "top-left" | "bottom-left";

/**
 * Decodes the barcode from RGBA pixels. Use "bottom-left" for `gl.readPixels` output (first row
 * is the bottom of the image) and "top-left" for canvas `getImageData`.
 */
export function decodeBarcodeRgba(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  origin: PixelOrigin = "top-left",
): number | null {
  const rowFromTop = height - barcodeStripHeight(height) / 2;
  const y = origin === "top-left" ? rowFromTop : height - 1 - rowFromTop;
  return decodeBarcodeRow(width, (x) => rgba[(y * width + x) * 4] ?? 0);
}
