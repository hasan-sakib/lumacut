import type { MediaKind, MediaResolver } from "@lumacut/engine";
import { api, errorMessage, type AssetOut } from "../api/client.ts";

/** Presigned URLs last about an hour; refresh well before they can expire mid-playback. */
export const URL_TTL_MS = 45 * 60 * 1000;

export class AssetUnavailableError extends Error {
  override name = "AssetUnavailableError";
}

interface Cached {
  expiresAt: number;
  asset: Promise<AssetOut>;
}

export interface AssetResolverOptions {
  fetchAsset: (assetId: string) => Promise<AssetOut>;
  now?: () => number;
}

export interface AssetResolver extends MediaResolver {
  /** Forget an asset's URLs (the engine saw a read fail); the next resolve asks the API again. */
  invalidate(assetId: string): void;
}

/** The URL the engine should read for a kind of use, or why there is none. */
export function pickUrl(asset: AssetOut, kind: MediaKind): string {
  if (asset.status !== "ready") {
    throw new AssetUnavailableError(`"${asset.name}" isn't ready yet (${asset.status})`);
  }
  // Video and audio are read from the proxy (the audio proxy is its own AAC file); images from the
  // normalized copy (or, small, the 2048 px preview), never the original upload.
  const url =
    kind === "image"
      ? asset.urls.normalized
      : kind === "preview"
        ? asset.urls.preview
        : kind === "lut"
          ? asset.urls.lut
          : asset.urls.proxy;
  if (url === undefined || url === null) {
    throw new AssetUnavailableError(`"${asset.name}" has no ${kind} rendition`);
  }
  return url;
}

/** Maps asset ids to the presigned storage URLs the engine reads, caching until near expiry. */
export function createAssetResolver(options: AssetResolverOptions): AssetResolver {
  const now = options.now ?? (() => Date.now());
  const cache = new Map<string, Cached>();

  return {
    async resolve(assetId, kind) {
      let entry = cache.get(assetId);
      if (entry === undefined || entry.expiresAt <= now()) {
        const asset = options.fetchAsset(assetId);
        entry = { expiresAt: now() + URL_TTL_MS, asset };
        cache.set(assetId, entry);
        // A failed lookup must not be remembered.
        asset.catch(() => {
          if (cache.get(assetId) === entry) cache.delete(assetId);
        });
      }
      return pickUrl(await entry.asset, kind);
    },
    invalidate(assetId) {
      cache.delete(assetId);
    },
  };
}

/** The resolver used by the app: asks the API (authenticated) for the asset record. */
export function createApiAssetResolver(): AssetResolver {
  return createAssetResolver({
    fetchAsset: async (assetId) => {
      const { data, error } = await api.GET("/api/assets/{asset_id}", {
        params: { path: { asset_id: assetId } },
      });
      if (data === undefined) throw new AssetUnavailableError(errorMessage(error));
      return data;
    },
  });
}
