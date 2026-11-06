import type { Clip, ColorSettings, Transform } from "@lumacut/schema";
import type { BlendMode } from "@lumacut/schema";
import type { Crop } from "../math/matrix.ts";
import type { DiagnosticSink } from "./diagnostics.ts";

export interface ResolvedLayerProps {
  transform: Transform;
  opacity: number;
  crop: Crop;
  blendMode: BlendMode;
}

/**
 * The clip's drawable properties at timeline time `tUs`. Every property is read through here so
 * that keyframe evaluation (M4a) changes this one function: today it returns the static value,
 * and `reportIgnoredFeatures` says so out loud when keyframes exist.
 */
export function resolveClipProps(clip: Clip, _tUs: number): ResolvedLayerProps {
  return {
    transform: clip.transform,
    opacity: clip.opacity,
    crop: clip.crop,
    blendMode: clip.blendMode,
  };
}

function isNeutralColor(color: ColorSettings): boolean {
  const scalars = [
    color.exposure,
    color.contrast,
    color.highlights,
    color.shadows,
    color.whites,
    color.blacks,
    color.temperature,
    color.tint,
    color.saturation,
    color.vibrance,
  ];
  const wheels = [color.lift, color.gamma, color.gain, color.offset].flat();
  return (
    scalars.every((v) => v === 0) &&
    wheels.every((v) => v === 0) &&
    color.curves === undefined &&
    color.hsl === undefined &&
    color.lut === undefined
  );
}

/** Tells the caller about clip features this engine version does not apply yet. */
export function reportIgnoredFeatures(clip: Clip, sink: DiagnosticSink): void {
  const warn = (code: string, message: string): void => {
    sink.add({ clipId: clip.id, level: "warning", code, message });
  };
  if (Object.values(clip.keyframes).some((frames) => frames.length > 0)) {
    warn("ignored_keyframes", "Keyframes aren't animated yet; the clip's static values are used.");
  }
  if (clip.masks.length > 0) warn("ignored_masks", "Masks aren't applied yet.");
  if (clip.trackMatte !== undefined)
    warn("ignored_track_matte", "Track mattes aren't applied yet.");
  if (!isNeutralColor(clip.color)) warn("ignored_color", "Colour grading isn't applied yet.");
  if (clip.effects.some((e) => e.enabled)) warn("ignored_effects", "Effects aren't applied yet.");
  if (clip.motionBlur.enabled) warn("ignored_motion_blur", "Motion blur isn't applied yet.");
  if (clip.transitionIn !== undefined) warn("ignored_transition", "Transitions aren't drawn yet.");
}
