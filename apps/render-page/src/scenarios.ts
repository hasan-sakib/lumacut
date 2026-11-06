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
} from "@lumacut/schema";

/** One entry of `perf-media.json` (written by `make perf-media`). */
export interface PerfMediaEntry {
  id: string;
  source: string;
  kind: "video" | "image";
  /** File name under /media. Doubles as the asset id in the benchmark project. */
  file: string;
  /** Declared (original) size: clip transforms are authored against it. */
  width: number;
  height: number;
  fps?: { num: number; den: number };
  durationUs?: number;
}

export const PERF_COMPOSITION = "perf";
export const PERF_SIZE = { width: 1920, height: 1080 } as const;
export const PERF_FPS = { num: 30, den: 1 } as const;
/** Clips are 10 s long; three back-to-back copies give a 30 s timeline (cuts included). */
const COPIES = 3;
const NOW: IsoUtcDateTime = "2026-11-02T00:00:00Z";

export interface LayerPlan {
  id: string;
  blendMode: BlendMode;
  opacity: number;
  scale: number;
  rotation: number;
  offsetX: number;
  offsetY: number;
}

/**
 * Three video tracks (1080p30, 1080p60, 720p24 proxies) and two image overlays, each with
 * transform, opacity and a blend mode, plus the first video's sound: the subset of SPEC §13's
 * playback scenario that M2 can draw. Text, shapes, colour and effects join it in M4a/M5.
 */
export const PERF_LAYERS: readonly LayerPlan[] = [
  { id: "perf_v1", blendMode: "normal", opacity: 1, scale: 1, rotation: 0, offsetX: 0, offsetY: 0 },
  {
    id: "perf_v2",
    blendMode: "screen",
    opacity: 0.85,
    scale: 0.62,
    rotation: 6,
    offsetX: 420,
    offsetY: -180,
  },
  {
    id: "perf_v3",
    blendMode: "multiply",
    opacity: 0.9,
    scale: 0.55,
    rotation: -9,
    offsetX: -480,
    offsetY: 230,
  },
  {
    id: "perf_i1",
    blendMode: "normal",
    opacity: 0.9,
    scale: 0.35,
    rotation: 15,
    offsetX: 500,
    offsetY: 280,
  },
  {
    id: "perf_i2",
    blendMode: "overlay",
    opacity: 0.7,
    scale: 0.3,
    rotation: 0,
    offsetX: -620,
    offsetY: -330,
  },
];

function assetOf(entry: PerfMediaEntry): Asset {
  const base = {
    id: entry.file,
    name: entry.file,
    sizeBytes: 0,
    source: "user" as const,
  };
  if (entry.kind === "image") {
    return {
      ...base,
      kind: "image",
      mimeType: "image/png",
      image: { width: entry.width, height: entry.height },
    };
  }
  const durationUs = entry.durationUs ?? 0;
  return {
    ...base,
    kind: "video",
    mimeType: "video/mp4",
    video: {
      width: entry.width,
      height: entry.height,
      fps: entry.fps ?? PERF_FPS,
      durationUs,
      codec: "avc1",
    },
    audio: { sampleRate: 48_000, channels: 2, durationUs, codec: "mp4a.40.2" },
  };
}

const DEFAULT_IMAGE_US = 10_000_000;

function copies(entry: PerfMediaEntry, make: (startUs: number, lengthUs: number) => Clip): Clip[] {
  const length = entry.durationUs ?? DEFAULT_IMAGE_US;
  return Array.from({ length: COPIES }, (_, i) => make(i * length, length));
}

/** The benchmark project; `entries` come from `perf-media.json` (every PERF_LAYERS id must be there). */
export function perfProject(entries: readonly PerfMediaEntry[]): Project {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const tracks = PERF_LAYERS.map((layer) => {
    const entry = byId.get(layer.id);
    if (entry === undefined) {
      throw new Error(`perf-media.json has no "${layer.id}": run \`make perf-media\``);
    }
    const base = centeredTransform(PERF_SIZE, entry);
    return createTrack({
      id: layer.id,
      kind: "visual",
      clips: copies(entry, (startUs, length) =>
        createClip({
          id: `${layer.id}-${String(startUs)}`,
          type: "media",
          assetId: entry.file,
          startUs,
          inUs: 0,
          outUs: length,
          blendMode: layer.blendMode,
          opacity: layer.opacity,
          transform: {
            ...base,
            x: base.x + layer.offsetX,
            y: base.y + layer.offsetY,
            scaleX: layer.scale,
            scaleY: layer.scale,
            rotation: layer.rotation,
          },
        }),
      ),
    });
  });
  const sound = byId.get("perf_v1");
  if (sound === undefined) throw new Error('perf-media.json has no "perf_v1"');
  tracks.push(
    createTrack({
      id: "sound",
      kind: "audio",
      clips: copies(sound, (startUs, length) =>
        createClip({
          id: `sound-${String(startUs)}`,
          type: "media",
          assetId: sound.file,
          startUs,
          inUs: 0,
          outUs: length,
        }),
      ),
    }),
  );
  const durationUs = COPIES * (sound.durationUs ?? DEFAULT_IMAGE_US);
  return createProject({
    id: "perf-project",
    now: NOW,
    assets: entries.map(assetOf),
    compositions: [
      createComposition({
        id: PERF_COMPOSITION,
        ...PERF_SIZE,
        fps: PERF_FPS,
        durationUs,
        tracks,
      }),
    ],
    mainCompositionId: PERF_COMPOSITION,
  });
}

/** One clip filling the composition: for the single-frame smoke test and the full-media seek test. */
export function singleClipProject(entry: PerfMediaEntry): Project {
  const size = { width: entry.width, height: entry.height };
  const length = entry.durationUs ?? DEFAULT_IMAGE_US;
  return createProject({
    id: "single",
    now: NOW,
    assets: [assetOf(entry)],
    compositions: [
      createComposition({
        id: "main",
        ...size,
        fps: entry.fps ?? PERF_FPS,
        durationUs: length,
        tracks: [
          createTrack({
            id: "v",
            kind: "visual",
            clips: [
              createClip({
                id: "c",
                type: "media",
                assetId: entry.file,
                outUs: length,
                transform: centeredTransform(size, size),
              }),
            ],
          }),
        ],
      }),
    ],
    mainCompositionId: "main",
  });
}
