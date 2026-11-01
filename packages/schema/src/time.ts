import type { Rational } from "./primitives.ts";

export const US_PER_SECOND = 1_000_000;

const US_PER_SECOND_BIG = BigInt(US_PER_SECOND);

function assertFrameIndex(frame: number): void {
  if (!Number.isSafeInteger(frame) || frame < 0) {
    throw new RangeError(`Frame index must be a non-negative safe integer, got ${String(frame)}`);
  }
}

function assertTimeUs(tUs: number): void {
  if (!Number.isSafeInteger(tUs) || tUs < 0) {
    throw new RangeError(`Time must be a non-negative integer of microseconds, got ${String(tUs)}`);
  }
}

/**
 * Start time of frame `frame` in microseconds: round-half-up of frame * 1e6 * den / num.
 * Computed with BigInt so results are exact for any project length.
 */
export function frameToUs(frame: number, fps: Rational): number {
  assertFrameIndex(frame);
  const num = BigInt(fps.num);
  const numerator = 2n * BigInt(frame) * US_PER_SECOND_BIG * BigInt(fps.den) + num;
  return Number(numerator / (2n * num));
}

/**
 * Index of the frame displayed at `tUs`, i.e. the unique `f` with
 * frameToUs(f) <= tUs < frameToUs(f + 1).
 */
export function usToFrame(tUs: number, fps: Rational): number {
  assertTimeUs(tUs);
  let frame = Number((BigInt(tUs) * BigInt(fps.num)) / (US_PER_SECOND_BIG * BigInt(fps.den)));
  // The estimate can be off by one at boundaries because frameToUs rounds; settle it exactly.
  while (frame > 0 && frameToUs(frame, fps) > tUs) frame -= 1;
  while (frameToUs(frame + 1, fps) <= tUs) frame += 1;
  return frame;
}

/** Duration of one frame period starting at `frame` (periods alternate for non-integer rates). */
export function frameDurationUs(frame: number, fps: Rational): number {
  return frameToUs(frame + 1, fps) - frameToUs(frame, fps);
}

export function fpsToNumber(fps: Rational): number {
  return fps.num / fps.den;
}

export interface ClipTiming {
  inUs: number;
  outUs: number;
  speed: number;
}

/**
 * Length of a clip on its timeline: (outUs - inUs) / speed, rounded to the nearest microsecond.
 * This is the single rounding rule every package must use.
 */
export function clipTimelineDurationUs(clip: ClipTiming): number {
  assertTimeUs(clip.inUs);
  assertTimeUs(clip.outUs);
  if (clip.outUs < clip.inUs) {
    throw new RangeError(
      `Clip outUs (${String(clip.outUs)}) is before inUs (${String(clip.inUs)})`,
    );
  }
  if (!(clip.speed > 0) || !Number.isFinite(clip.speed)) {
    throw new RangeError(`Clip speed must be a positive finite number, got ${String(clip.speed)}`);
  }
  return Math.round((clip.outUs - clip.inUs) / clip.speed);
}
