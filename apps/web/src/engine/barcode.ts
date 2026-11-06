import type { PlaybackSession } from "@lumacut/engine";
import { decodeBarcodeRgba } from "@lumacut/engine/barcode";

/** The frame number in the picture's barcode strip, or null when there is none to read. */
export async function readBarcode(session: PlaybackSession): Promise<number | null> {
  const result = await session.readPixels();
  return decodeBarcodeRgba(result.pixels, result.width, result.height, "top-left");
}
