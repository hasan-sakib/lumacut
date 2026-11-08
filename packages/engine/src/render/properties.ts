import { animatedClip, resolveProperty } from "@lumacut/ops";
import type { Clip, Transform } from "@lumacut/schema";
import type { BlendMode } from "@lumacut/schema";
import type { Crop } from "../math/matrix.ts";
import type { DiagnosticSink } from "./diagnostics.ts";

export interface ResolvedLayerProps {
  /** The clip with every animated property replaced by its value at this time. */
  clip: Clip;
  transform: Transform;
  opacity: number;
  crop: Crop;
  blendMode: BlendMode;
}

/**
 * The clip's drawable properties at composition time `tUs`: keyframes are evaluated (they are
 * clip-local, so the time is `tUs - clip.startUs`) and every other property is its static value.
 * Everything the engine draws is read through here.
 */
export function resolveClipProps(clip: Clip, tUs: number): ResolvedLayerProps {
  const resolved = animatedClip(clip, tUs - clip.startUs);
  return {
    clip: resolved,
    transform: resolved.transform,
    opacity: resolved.opacity,
    crop: resolved.crop,
    blendMode: resolved.blendMode,
  };
}

/** Tells the caller about clip features this engine version does not apply yet. */
export function reportIgnoredFeatures(clip: Clip, sink: DiagnosticSink): void {
  const warn = (code: string, message: string): void => {
    sink.add({ clipId: clip.id, level: "warning", code, message });
  };
  // Audio keyframes belong to the audio engine (it reports them); anything else that doesn't
  // resolve to an animatable property (a mask path before M5, a stale path) is not applied.
  const unanimated = Object.entries(clip.keyframes).filter(
    ([path, frames]) =>
      frames.length > 0 && !path.startsWith("audio.") && resolveProperty(clip, path) === undefined,
  );
  if (unanimated.length > 0) {
    warn(
      "ignored_keyframes",
      `Keyframes on ${unanimated.map(([path]) => `"${path}"`).join(", ")} can't be animated yet.`,
    );
  }
  if (clip.masks.some((m) => m.kind === "raster")) {
    warn(
      "ignored_raster_mask",
      "Bitmap masks aren't applied yet (they arrive with the photo tools).",
    );
  }
}
