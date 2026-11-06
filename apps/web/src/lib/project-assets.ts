import type { Asset } from "@lumacut/schema";
import type { AssetOut } from "../api/client.ts";

/**
 * A library asset as the project document refers to it, or null when it can't be used yet (not
 * processed, or no probe data). Sizes and durations are those of the original upload: clip
 * transforms are authored against them, whatever rendition the engine decodes.
 */
export function toProjectAsset(asset: AssetOut): Asset | null {
  if (asset.status !== "ready" || asset.kind === null || asset.media === null) return null;
  const base = {
    id: asset.id,
    name: asset.name,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    source: "user" as const,
  };
  const { video, audio, image } = asset.media;
  if (asset.kind === "video" && video) {
    return { ...base, kind: "video", video, ...(audio ? { audio } : {}) };
  }
  if (asset.kind === "audio" && audio) return { ...base, kind: "audio", audio };
  if (asset.kind === "image" && image) return { ...base, kind: "image", image };
  return null;
}
