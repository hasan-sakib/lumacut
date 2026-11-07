import { useRemoteJson } from "../components/library/useRemoteJson.ts";
import { useAssetsStore } from "../stores/assets.ts";
import type { ThumbIndex } from "../timeline/filmstrip.ts";
import type { WaveformJson } from "../timeline/waveform.ts";

export interface ClipMedia {
  kind: "video" | "audio" | "image" | null;
  thumbIndex: ThumbIndex | null;
  /** Sprite sheet URLs in order (video). */
  sheets: readonly string[];
  /** A single thumbnail (images). */
  thumb: string | null;
  waveform: WaveformJson | null;
}

/**
 * The library renditions the timeline draws on a clip: sprite-sheet index and sheets for video,
 * a thumbnail for images, the peaks file for audio. Fetched once per asset (shared cache) and
 * only when `enabled`, so clips scrolled out of view cost nothing.
 */
export function useClipMedia(assetId: string | undefined, enabled: boolean): ClipMedia {
  const asset = useAssetsStore((s) => (assetId === undefined ? undefined : s.byId[assetId]));
  const urls = asset?.urls;
  const thumbIndex = useRemoteJson(
    urls?.thumbIndex,
    enabled && asset?.kind === "video",
  ) as ThumbIndex | null;
  const waveform = useRemoteJson(
    urls?.waveform,
    enabled && (asset?.kind === "audio" || asset?.kind === "video"),
  ) as WaveformJson | null;
  return {
    kind: asset?.kind ?? null,
    thumbIndex,
    sheets: urls?.thumbSheets ?? [],
    thumb: urls?.thumb ?? null,
    waveform,
  };
}
