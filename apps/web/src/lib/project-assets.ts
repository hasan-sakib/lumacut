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

export type AssetQueryResult = { asset: Asset } | { error: string };

/**
 * Finds the ready library asset a person or the AI means: an exact id, an exact name, or a name
 * containing the text (case-insensitive). Several matches is an error naming them, never a guess.
 */
export function resolveAssetQuery(assets: readonly AssetOut[], query: string): AssetQueryResult {
  const text = query.trim();
  if (text === "") return { error: "Say which asset to add (its name is enough)." };
  const lower = text.toLowerCase();
  const usable = assets.flatMap((a) => {
    const asset = toProjectAsset(a);
    return asset === null ? [] : [asset];
  });
  const byId = usable.find((a) => a.id === text);
  if (byId !== undefined) return { asset: byId };
  const exact = usable.filter((a) => a.name.toLowerCase() === lower);
  const candidates = exact.length > 0 ? exact : usable.filter((a) => a.name.toLowerCase().includes(lower));
  if (candidates.length === 1 && candidates[0] !== undefined) return { asset: candidates[0] };
  if (candidates.length === 0) return { error: `No ready asset matches “${text}”.` };
  const shown = candidates.slice(0, 3).map((a) => `“${a.name}”`).join(", ");
  return { error: `“${text}” matches ${String(candidates.length)} assets (${shown}${candidates.length > 3 ? ", …" : ""}). Type more of the name.` };
}
