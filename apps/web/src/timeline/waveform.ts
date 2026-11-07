import type { Clip } from "@lumacut/schema";

/** audiowaveform v2 JSON from the worker: interleaved min/max pairs per channel. */
export interface WaveformJson {
  channels: number;
  length: number;
  data: number[];
  sample_rate?: number;
  samples_per_pixel?: number;
}

const DEFAULT_PEAKS_PER_SECOND = 100;

export const peaksPerSecond = (w: WaveformJson): number =>
  w.sample_rate !== undefined && w.samples_per_pixel !== undefined && w.samples_per_pixel > 0
    ? w.sample_rate / w.samples_per_pixel
    : DEFAULT_PEAKS_PER_SECOND;

/** Largest magnitude (0..1) over peak positions [from, to) of the waveform. */
function peakBetween(w: WaveformJson, from: number, to: number): number {
  const perPixel = w.channels * 2;
  const start = Math.max(0, Math.floor(from));
  const end = Math.min(w.length, Math.max(start + 1, Math.ceil(to)));
  let peak = 0;
  for (let px = start; px < end; px += 1) {
    for (let i = 0; i < perPixel; i += 1)
      peak = Math.max(peak, Math.abs(w.data[px * perPixel + i] ?? 0));
  }
  return Math.min(1, peak / 127);
}

/**
 * `bars` peak heights (0..1) for the part of the source a clip plays, left to right as it appears
 * on the timeline: a reversed clip shows its waveform mirrored.
 */
export function waveformSlice(clip: Clip, waveform: WaveformJson, bars: number): number[] {
  if (bars <= 0) return [];
  const pps = peaksPerSecond(waveform);
  const from = (clip.inUs / 1_000_000) * pps;
  const span = ((clip.outUs - clip.inUs) / 1_000_000) * pps;
  const out: number[] = [];
  for (let b = 0; b < bars; b += 1) {
    const slot = clip.reversed ? bars - 1 - b : b;
    out.push(peakBetween(waveform, from + (slot / bars) * span, from + ((slot + 1) / bars) * span));
  }
  return out;
}
