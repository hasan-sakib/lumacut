import { frameToUs, usToFrame, type Rational } from "@lumacut/schema";
import { must } from "../lib/must.ts";

export const US_PER_SECOND = 1_000_000;
export const MIN_PX_PER_SEC = 2;
export const MAX_PX_PER_SEC = 4000;
export const DEFAULT_PX_PER_SEC = 100;

export const usToPx = (us: number, pxPerSec: number): number => (us / US_PER_SECOND) * pxPerSec;
export const pxToUs = (px: number, pxPerSec: number): number =>
  Math.round((px / pxPerSec) * US_PER_SECOND);

export const clampZoom = (pxPerSec: number): number =>
  Math.min(MAX_PX_PER_SEC, Math.max(MIN_PX_PER_SEC, pxPerSec));

/** Zoom in (factor > 1) or out (< 1), within the limits. */
export const zoomBy = (pxPerSec: number, factor: number): number => clampZoom(pxPerSec * factor);

/** The zoom at which `durationUs` fills `widthPx` (minus a margin), for "fit to window". */
export function fitZoom(durationUs: number, widthPx: number, marginPx = 40): number {
  if (durationUs <= 0 || widthPx <= marginPx) return DEFAULT_PX_PER_SEC;
  return clampZoom(((widthPx - marginPx) * US_PER_SECOND) / durationUs);
}

/** The scroll position (µs at the left edge) that keeps the time under `anchorPx` still while zooming. */
export function scrollAfterZoom(
  scrollUs: number,
  anchorPx: number,
  oldPxPerSec: number,
  newPxPerSec: number,
): number {
  const anchorUs = scrollUs + pxToUs(anchorPx, oldPxPerSec);
  return Math.max(0, anchorUs - pxToUs(anchorPx, newPxPerSec));
}

/** The nearest frame start to `us` for a composition at `fps` (ties go to the earlier frame). */
export function roundToFrame(us: number, fps: Rational): number {
  const safe = Math.max(0, Math.round(us));
  const before = usToFrame(safe, fps);
  const a = frameToUs(before, fps);
  const b = frameToUs(before + 1, fps);
  return safe - a <= b - safe ? a : b;
}

/** Spacing of ruler ticks: the smallest "nice" step (1, 2, 5 × 10ⁿ) that is at least `minPx` wide. */
const STEPS_US = [
  1_000, 2_000, 5_000, 10_000, 20_000, 50_000, 100_000, 200_000, 500_000, 1_000_000, 2_000_000,
  5_000_000, 10_000_000, 15_000_000, 30_000_000, 60_000_000, 120_000_000, 300_000_000, 600_000_000,
  1_800_000_000, 3_600_000_000,
];

export function tickStepUs(pxPerSec: number, minPx = 80): number {
  return STEPS_US.find((step) => usToPx(step, pxPerSec) >= minPx) ?? must(STEPS_US.at(-1));
}

export interface Tick {
  us: number;
  /** Major ticks carry a label; minor ticks (halves of a step) don't. */
  major: boolean;
}

/** Ticks covering the visible window, from the scroll position across `widthPx`. */
export function rulerTicks(
  scrollUs: number,
  widthPx: number,
  pxPerSec: number,
  minPx = 80,
): Tick[] {
  const step = tickStepUs(pxPerSec, minPx);
  const half = step / 2;
  const endUs = scrollUs + pxToUs(widthPx, pxPerSec);
  const ticks: Tick[] = [];
  for (let us = Math.floor(scrollUs / half) * half; us <= endUs; us += half) {
    ticks.push({ us, major: us % step === 0 });
  }
  return ticks;
}
