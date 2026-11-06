import { frameToUs, usToFrame, type Rational } from "@lumacut/schema";

/** Start time of the final frame of a composition (the furthest the playhead may rest on). */
export function lastFrameUs(durationUs: number, fps: Rational): number {
  return durationUs <= 0 ? 0 : frameToUs(usToFrame(durationUs - 1, fps), fps);
}

function clamp(us: number, durationUs: number, fps: Rational): number {
  return Math.min(Math.max(0, us), lastFrameUs(durationUs, fps));
}

/** The frame boundary `frames` frames away from the frame showing at `timeUs`. */
export function stepTarget(
  timeUs: number,
  frames: number,
  fps: Rational,
  durationUs: number,
): number {
  const here = usToFrame(clamp(timeUs, durationUs, fps), fps);
  const last = usToFrame(lastFrameUs(durationUs, fps), fps);
  return frameToUs(Math.min(Math.max(0, here + frames), last), fps);
}

/** A jump of whole seconds, landing on a frame boundary inside the composition. */
export function skipTarget(
  timeUs: number,
  seconds: number,
  fps: Rational,
  durationUs: number,
): number {
  const moved = clamp(Math.round(timeUs + seconds * 1_000_000), durationUs, fps);
  return frameToUs(usToFrame(moved, fps), fps);
}

/** "HH:MM:SS:FF" for the frame showing at `us` (frame count wraps at the nominal frame rate). */
export function formatTimecode(us: number, fps: Rational): string {
  const frame = usToFrame(Math.max(0, us), fps);
  const nominal = Math.round(fps.num / fps.den);
  const totalSeconds = Math.floor(frame / nominal);
  const pad = (n: number) => String(n).padStart(2, "0");
  return [
    pad(Math.floor(totalSeconds / 3600)),
    pad(Math.floor(totalSeconds / 60) % 60),
    pad(totalSeconds % 60),
    pad(frame % nominal),
  ].join(":");
}
