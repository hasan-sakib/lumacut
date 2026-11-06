import { MediaError } from "./media.ts";

/**
 * Fetches an image (cross-origin, CORS) as a premultiplied-alpha bitmap ready for upload.
 * Orientation and colour profile are already normalised by the M1 pipeline.
 */
export async function loadImageBitmap(assetId: string, url: string): Promise<ImageBitmap> {
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
    return await createImageBitmap(await response.blob(), { premultiplyAlpha: "premultiply" });
  } catch (error) {
    throw new MediaError(assetId, `couldn't decode the image: ${String(error)}`, { cause: error });
  }
}
