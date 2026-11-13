import type { Project } from "@lumacut/schema";
import type { MediaResolver } from "../decode/media.ts";
import type { Diagnostic } from "../render/diagnostics.ts";
import { AudioEngine } from "./audio-engine.ts";
import { limitPeaks } from "./dsp/limiter.ts";
import { measureLoudness, truePeakOf, type LoudnessReport } from "./loudness.ts";

/** The longest mix the browser renders in one go (longer exports go to the server, M8). */
export const MAX_BROWSER_MIX_S = 30 * 60;

export interface MixOptions {
  compositionId: string;
  fromUs: number;
  toUs: number;
  sampleRate?: number;
  /** Read the uploaded files instead of the proxies (exports). */
  media?: "proxy" | "original";
}

export interface Mix {
  channels: Float32Array[];
  sampleRate: number;
  diagnostics: Diagnostic[];
}

/**
 * Renders the sound of a composition between two instants to stereo samples, offline, through the
 * same audio engine the editor plays with (effects, automation, faders), so the export sounds like
 * the preview.
 */
export async function renderMix(
  project: Project,
  resolver: MediaResolver,
  options: MixOptions,
): Promise<Mix> {
  const sampleRate = options.sampleRate ?? 48_000;
  const seconds = Math.max(0, (options.toUs - options.fromUs) / 1_000_000);
  if (seconds > MAX_BROWSER_MIX_S) {
    throw new Error(
      `The browser mixes at most ${String(MAX_BROWSER_MIX_S / 60)} minutes at once; this is ${String(Math.ceil(seconds / 60))}.`,
    );
  }
  const frames = Math.max(1, Math.round(seconds * sampleRate));
  const context = new OfflineAudioContext({ numberOfChannels: 2, length: frames, sampleRate });
  const engine = new AudioEngine({
    context,
    resolver,
    meters: false,
    lookaheadUs: 0,
    ...(options.media === undefined ? {} : { media: options.media }),
  });
  try {
    engine.setProject(project);
    await engine.start(options.compositionId, options.fromUs, 0);
    await engine.scheduleUntil(options.toUs);
    const rendered = await context.startRendering();
    return {
      channels: [rendered.getChannelData(0), rendered.getChannelData(1)],
      sampleRate,
      diagnostics: [...engine.diagnostics],
    };
  } finally {
    await engine.dispose();
  }
}

/** The common delivery targets (EBU R 128 broadcast and the usual streaming/social level). */
export const LOUDNESS_TARGETS = { social: -14, broadcast: -23 } as const;

export interface NormalizeResult {
  channels: Float32Array[];
  /** Gain applied before limiting, dB. */
  gainDb: number;
  before: LoudnessReport;
  after: LoudnessReport;
  /** The limiter had to hold peaks down to reach the target. */
  limited: boolean;
}

/**
 * Brings a mix to `targetLufs` integrated loudness with true peaks at or below `ceilingDbtp`.
 * When the gain alone would push peaks over the ceiling, a look-ahead limiter holds them down (a
 * second pass corrects the small loudness loss that causes). Returns new arrays; silent input is
 * returned unchanged.
 */
export function normalizeLoudness(
  channels: readonly Float32Array[],
  sampleRate: number,
  targetLufs: number,
  ceilingDbtp = -1,
): NormalizeResult {
  const before = measureLoudness(channels, sampleRate);
  if (!Number.isFinite(before.integrated)) {
    return {
      channels: channels.map((ch) => ch.slice()),
      gainDb: 0,
      before,
      after: before,
      limited: false,
    };
  }
  let gainDb = targetLufs - before.integrated;
  let limited = false;
  const ceiling = 10 ** (ceilingDbtp / 20);
  const apply = (db: number) => {
    const g = 10 ** (db / 20);
    const out = channels.map((ch) => ch.map((v) => v * g));
    // Sample peaks a little under the ceiling leave room for inter-sample overs.
    if (truePeakOf(out) > ceiling) {
      limited = true;
      limitPeaks(out, sampleRate, ceiling * 0.94);
    }
    return out;
  };
  let out = apply(gainDb);
  let after = measureLoudness(out, sampleRate);
  if (Number.isFinite(after.integrated) && Math.abs(after.integrated - targetLufs) > 0.2) {
    gainDb += targetLufs - after.integrated;
    out = apply(gainDb);
    after = measureLoudness(out, sampleRate);
  }
  return { channels: out, gainDb, before, after, limited };
}
