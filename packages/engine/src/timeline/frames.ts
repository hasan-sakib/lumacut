import { frameToUs, type Rational } from "@lumacut/schema";

/**
 * Timestamp (seconds) at the middle of frame `n`. Decoders return "the last frame at or before t",
 * so asking at the centre can never pick a neighbour through float/µs rounding, unlike asking at
 * the exact start (30000/1001 fps frame 2 starts at 66 733.33 µs, which rounds down).
 */
export function frameCenterSeconds(frame: number, fps: Rational): number {
  return (frameToUs(frame, fps) + frameToUs(frame + 1, fps)) / 2 / 1_000_000;
}
