import {
  centeredTransform,
  createClip,
  createComposition,
  createProject,
  createTrack,
  type Asset,
  type BlendMode,
  type Clip,
  type IsoUtcDateTime,
  type Project,
  type Track,
} from "@lumacut/schema";
import type { AssetOut } from "../api/client.ts";

export const BENCH_COMPOSITION_ID = "bench";
export const BENCH_FPS = { num: 30, den: 1 } as const;
export const BENCH_SIZE = { width: 1920, height: 1080 } as const;
/** Stills have no duration of their own: they show for this long on the bench. */
export const IMAGE_DURATION_US = 10_000_000;

/** One row of the bench: an asset placed on the composition with the properties under test. */
export interface BenchLayer {
  id: string;
  assetId: string;
  name: string;
  kind: "video" | "audio" | "image";
  /** Source width, height and length (µs) as probed. */
  width: number;
  height: number;
  durationUs: number;
  blendMode: BlendMode;
  opacity: number;
  scale: number;
  /** Degrees. */
  rotation: number;
  /** Fraction of the layer removed from each edge. */
  crop: { left: number; top: number; right: number; bottom: number };
  /** Offset from the centre of the composition, in composition pixels. */
  offsetX: number;
  offsetY: number;
  /** Include this asset's sound (video and audio assets). */
  audible: boolean;
}

/** A new layer for a library asset, or null when the asset can't be placed (not ready, no media). */
export function layerFromAsset(asset: AssetOut, layerId: string): BenchLayer | null {
  if (
    asset.status !== "ready" ||
    asset.kind === null ||
    asset.kind === "lut" ||
    asset.media === null
  )
    return null;
  const base = {
    id: layerId,
    assetId: asset.id,
    name: asset.name,
    kind: asset.kind,
    blendMode: "normal" as const,
    opacity: 1,
    scale: 1,
    rotation: 0,
    crop: { left: 0, top: 0, right: 0, bottom: 0 },
    offsetX: 0,
    offsetY: 0,
    audible: asset.kind !== "image",
  };
  const video = asset.media.video;
  if (asset.kind === "video" && video) {
    return { ...base, width: video.width, height: video.height, durationUs: video.durationUs };
  }
  const audio = asset.media.audio;
  if (asset.kind === "audio" && audio) {
    return { ...base, width: 0, height: 0, durationUs: audio.durationUs };
  }
  const image = asset.media.image;
  if (asset.kind === "image" && image) {
    return { ...base, width: image.width, height: image.height, durationUs: IMAGE_DURATION_US };
  }
  return null;
}

function assetOf(layer: BenchLayer): Asset {
  return {
    id: layer.assetId,
    kind: layer.kind,
    name: layer.name,
    mimeType: layer.kind === "image" ? "image/png" : `${layer.kind}/mp4`,
    sizeBytes: 0,
    source: "user",
    ...(layer.kind === "video"
      ? {
          video: {
            width: layer.width,
            height: layer.height,
            fps: { num: 30, den: 1 },
            durationUs: layer.durationUs,
            codec: "h264",
          },
        }
      : {}),
    ...(layer.kind === "audio"
      ? {
          audio: { sampleRate: 48_000, channels: 2, durationUs: layer.durationUs, codec: "aac" },
        }
      : {}),
    ...(layer.kind === "image" ? { image: { width: layer.width, height: layer.height } } : {}),
  };
}

function visualClip(layer: BenchLayer): Clip {
  const size = { width: layer.width, height: layer.height };
  const transform = centeredTransform(BENCH_SIZE, size);
  return createClip({
    id: `${layer.id}-clip`,
    type: "media",
    assetId: layer.assetId,
    startUs: 0,
    inUs: 0,
    outUs: layer.durationUs,
    blendMode: layer.blendMode,
    opacity: layer.opacity,
    crop: layer.crop,
    transform: {
      ...transform,
      x: transform.x + layer.offsetX,
      y: transform.y + layer.offsetY,
      scaleX: layer.scale,
      scaleY: layer.scale,
      rotation: layer.rotation,
    },
  });
}

function audioClip(layer: BenchLayer): Clip {
  return createClip({
    id: `${layer.id}-audio`,
    type: "media",
    assetId: layer.assetId,
    startUs: 0,
    inUs: 0,
    outUs: layer.durationUs,
  });
}

/**
 * The bench document: one visual track per picture layer (first layer at the bottom), and one audio
 * track per audible layer. Pure: ids come from the layers, the timestamp from the caller.
 */
export function buildBenchProject(layers: readonly BenchLayer[], now: IsoUtcDateTime): Project {
  const tracks: Track[] = [];
  for (const layer of layers) {
    if (layer.kind !== "audio") {
      tracks.push(createTrack({ id: `${layer.id}-v`, kind: "visual", clips: [visualClip(layer)] }));
    }
  }
  for (const layer of layers) {
    if (layer.audible && layer.kind !== "image") {
      tracks.push(createTrack({ id: `${layer.id}-a`, kind: "audio", clips: [audioClip(layer)] }));
    }
  }
  const durationUs = layers.reduce((max, layer) => Math.max(max, layer.durationUs), 0);
  const assets = new Map<string, Asset>();
  for (const layer of layers) assets.set(layer.assetId, assetOf(layer));
  return createProject({
    id: "bench-project",
    now,
    assets: [...assets.values()],
    compositions: [
      createComposition({
        id: BENCH_COMPOSITION_ID,
        ...BENCH_SIZE,
        fps: BENCH_FPS,
        durationUs,
        tracks,
      }),
    ],
    mainCompositionId: BENCH_COMPOSITION_ID,
  });
}
