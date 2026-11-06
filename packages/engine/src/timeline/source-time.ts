/**
 * Timeline time -> source time -> source frame, in integer microseconds.
 *
 * Frame start times are rounded to whole microseconds (`frameToUs`), so two instants that are the
 * "same" frame boundary can differ by 1 µs depending on how they were computed (for example
 * `inUs + local` against `frameToUs(i + k)` at 30000/1001 fps). A lookup landing 1 µs before a
 * boundary would decode the neighbouring frame. To make boundaries robust we sample
 * `SAMPLE_BIAS_US` in the direction of playback: forward playback samples just after the instant,
 * reverse playback just before it. Consequence (by design): an instant within 2 µs before a frame
 * boundary belongs to the next frame; times produced by `frameToUs` are never affected.
 */
import { clipTimelineDurationUs, usToFrame, type Clip, type Rational } from "@lumacut/schema";

export const SAMPLE_BIAS_US = 2;

export type TimedClip = Pick<
  Clip,
  "startUs" | "inUs" | "outUs" | "speed" | "reversed" | "freezeAtUs"
>;

/** Length of the clip on its timeline (the schema's single rounding rule). */
export function clipDurationUs(clip: TimedClip): number {
  return clipTimelineDurationUs(clip);
}

/** First timeline instant after the clip. */
export function clipEndUs(clip: TimedClip): number {
  return clip.startUs + clipDurationUs(clip);
}

/** True while the clip is on screen: `startUs <= t < end`. */
export function isClipActive(clip: TimedClip, tUs: number): boolean {
  return tUs >= clip.startUs && tUs < clipEndUs(clip);
}

/**
 * The source instant (µs) whose frame is shown at timeline time `tUs`, with the playback-direction
 * bias applied. Normal and reversed clips stay inside `[inUs, outUs - 1]`; a freeze frame always
 * shows `freezeAtUs`. Assumes the clip is active.
 */
export function sourceInstantUs(clip: TimedClip, tUs: number): number {
  if (clip.freezeAtUs !== undefined) return clip.freezeAtUs + SAMPLE_BIAS_US;
  const offset = Math.round((tUs - clip.startUs) * clip.speed);
  const instant = clip.reversed
    ? clip.outUs - offset - SAMPLE_BIAS_US
    : clip.inUs + offset + SAMPLE_BIAS_US;
  const last = Math.max(clip.inUs, clip.outUs - 1);
  return Math.min(last, Math.max(clip.inUs, instant));
}

/** Index of the media's frame shown at `tUs`, given the media's constant frame rate. */
export function sourceFrameIndex(clip: TimedClip, tUs: number, mediaFps: Rational): number {
  return usToFrame(Math.max(0, sourceInstantUs(clip, tUs)), mediaFps);
}
