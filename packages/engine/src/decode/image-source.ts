import { MediaError } from "./media.ts";

/**
 * Fetches an image (cross-origin, CORS) as a premultiplied-alpha bitmap ready for upload.
 * Orientation and colour profile are already normalised by the M1 pipeline.
 */
export async function loadImageBitmap(
  assetId: string,
  url: string,
  maxSide = Number.POSITIVE_INFINITY,
): Promise<ImageBitmap> {
  let response: Response;
  try {
    response = await fetch(url, { mode: "cors" });
  } catch (error) {
    throw new MediaError(assetId, `couldn't download the image: ${String(error)}`, {
      cause: error,
    });
  }
  if (!response.ok) {
    throw new MediaError(assetId, `couldn't download the image (HTTP ${String(response.status)})`);
  }
  try {
    const bitmap = await createImageBitmap(await response.blob(), {
      premultiplyAlpha: "premultiply",
    });
    const long = Math.max(bitmap.width, bitmap.height);
    if (long <= maxSide) return bitmap;
    // Larger than the GPU can hold: shrink it to fit (the aspect ratio is kept).
    const factor = maxSide / long;
    try {
      return await createImageBitmap(bitmap, {
        premultiplyAlpha: "premultiply",
        resizeWidth: Math.max(1, Math.floor(bitmap.width * factor)),
        resizeHeight: Math.max(1, Math.floor(bitmap.height * factor)),
        resizeQuality: "high",
      });
    } finally {
      bitmap.close();
    }
  } catch (error) {
    throw new MediaError(assetId, `couldn't decode the image: ${String(error)}`, { cause: error });
  }
}
