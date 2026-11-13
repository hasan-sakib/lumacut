/**
 * What an export makes. The same settings drive the browser export (WebCodecs) and the server
 * export (FFmpeg); the API mirrors this type (`services/api/lumacut_api/exports_service.py`).
 */
export type ExportFormat = "mp4" | "webm" | "gif" | "mp3";
export type ExportResolution = "720p" | "1080p" | "source";
export type ExportQuality = "high" | "medium" | "small";
export type ExportLoudness = "social" | "broadcast" | "none";

export interface ExportSettings {
  format: ExportFormat;
  resolution: ExportResolution;
  fps: 24 | 25 | 30 | 60;
  quality: ExportQuality;
  /** The range to export, composition µs. */
  fromUs: number;
  toUs: number;
  loudness: ExportLoudness;
}

/** GIFs are kept short and small (SPEC §11: ≤ 15 s). */
export const GIF_LIMITS = { maxSeconds: 15, maxSide: 720, maxFps: 25 } as const;
/** Longest video the browser exports (it holds the whole file in memory). */
export const BROWSER_MAX_SECONDS = 10 * 60;

const even = (n: number): number => Math.max(2, 2 * Math.round(n / 2));

/**
 * The output picture size: 720p / 1080p set the *short* side (a 9:16 video at 1080p is
 * 1080 × 1920), `source` keeps the composition's size; both sides are even (H.264 needs it). GIFs
 * are limited to 720 px on the long side.
 */
export function outputSize(
  canvas: { width: number; height: number },
  settings: Pick<ExportSettings, "resolution" | "format">,
): { width: number; height: number } {
  const short = Math.min(canvas.width, canvas.height);
  let scale =
    settings.resolution === "720p"
      ? 720 / short
      : settings.resolution === "1080p"
        ? 1080 / short
        : 1;
  if (settings.format === "gif") {
    scale = Math.min(scale, GIF_LIMITS.maxSide / Math.max(canvas.width, canvas.height));
  }
  return { width: even(canvas.width * scale), height: even(canvas.height * scale) };
}

/** Frames to encode: `count` frames, frame `i` showing composition time `timeOf(i)` (µs). */
export interface FramePlan {
  count: number;
  fps: number;
  timeOf: (i: number) => number;
  /** Its timestamp in the file (seconds from 0). */
  timestampOf: (i: number) => number;
}

export function framePlan(fromUs: number, toUs: number, fps: number): FramePlan {
  const seconds = Math.max(0, toUs - fromUs) / 1_000_000;
  const count = Math.max(1, Math.round(seconds * fps));
  return {
    count,
    fps,
    timeOf: (i) => fromUs + Math.round((i * 1_000_000) / fps),
    timestampOf: (i) => i / fps,
  };
}

/** Bits per pixel per frame for each quality (H.264-like efficiency; VP9 gets 70% of it). */
const BITS_PER_PIXEL: Record<ExportQuality, number> = { high: 0.12, medium: 0.07, small: 0.04 };
const AUDIO_BITRATE: Record<ExportQuality, number> = {
  high: 256_000,
  medium: 192_000,
  small: 128_000,
};

export function videoBitrate(
  size: { width: number; height: number },
  fps: number,
  settings: Pick<ExportSettings, "quality" | "format">,
): number {
  const factor = settings.format === "webm" ? 0.7 : 1;
  return Math.max(
    500_000,
    Math.round(size.width * size.height * fps * BITS_PER_PIXEL[settings.quality] * factor),
  );
}

export const audioBitrate = (quality: ExportQuality): number => AUDIO_BITRATE[quality];

/** LUFS for a loudness choice, or null to keep the mix as it is. */
export function loudnessTarget(choice: ExportLoudness): number | null {
  return choice === "social" ? -14 : choice === "broadcast" ? -23 : null;
}

/** A rough file size in bytes (video + audio bitrates over the duration). */
export function estimateBytes(
  canvas: { width: number; height: number },
  settings: ExportSettings,
): number {
  const seconds = Math.max(0, settings.toUs - settings.fromUs) / 1_000_000;
  if (settings.format === "mp3") return Math.round((seconds * 190_000) / 8);
  const size = outputSize(canvas, settings);
  if (settings.format === "gif") {
    return Math.round(
      seconds * Math.min(settings.fps, GIF_LIMITS.maxFps) * size.width * size.height * 0.15,
    );
  }
  const bits = videoBitrate(size, settings.fps, settings) + audioBitrate(settings.quality);
  return Math.round((seconds * bits) / 8);
}
