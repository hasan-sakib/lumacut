export type MediaKind = "video" | "audio" | "image" | "preview" | "lut";

/**
 * Where the engine finds media. The web app implements it from the library API (presigned proxy /
 * image / audio URLs); tests map asset ids to fixture files. URLs must be readable cross-origin
 * with range requests (bucket CORS exposes Content-Range).
 */
export interface MediaResolver {
  resolve(assetId: string, kind: MediaKind): Promise<string>;
}

export class MediaError extends Error {
  override name = "MediaError";
  readonly assetId: string;

  constructor(assetId: string, message: string, options?: ErrorOptions) {
    super(`Asset ${assetId}: ${message}`, options);
    this.assetId = assetId;
  }
}
