import { BUILTIN_LUTS } from "@lumacut/engine/color";
import {
  createClip,
  createTrack,
  neutralColor,
  type Clip,
  type Composition,
  type Op,
} from "@lumacut/schema";

/** "Paint 3": the next free number for a layer name starting with `base`. */
export function nextLayerName(comp: Composition, base: string): string {
  const taken = new Set(comp.tracks.map((t) => t.name));
  for (let n = 1; ; n += 1) {
    const name = `${base} ${String(n)}`;
    if (!taken.has(name)) return name;
  }
}

/**
 * Ops that put `clip` on a new layer above all the others: in a photo every layer is its own
 * track holding one clip (all starting at time 0).
 */
export function addLayerOps(
  comp: Composition,
  clip: Clip,
  trackId: string,
  name: string,
  index = comp.tracks.length,
): Op[] {
  return [
    {
      type: "addTrack",
      compositionId: comp.id,
      track: createTrack({ id: trackId, kind: "visual", name }),
      index,
    },
    { type: "addClip", trackId, clip },
  ];
}

/** The track a clip is on. */
export function trackOfClip(comp: Composition, clipId: string) {
  return comp.tracks.find((t) => t.clips.some((c) => c.id === clipId));
}

/**
 * Ops that add one built-in look as an adjustment layer over everything: a photo's single frame,
 * or a video's whole length (at least `minUs`). `clipId` and `trackId` are the new layer's ids.
 */
export function lookLayerOps(
  comp: Composition,
  options: {
    lookId: string;
    photo: boolean;
    minUs: number;
    clipId: string;
    trackId: string;
    intensity?: number;
  },
): Op[] {
  const info = BUILTIN_LUTS.find((l) => l.id === options.lookId);
  return addLayerOps(
    comp,
    createClip({
      id: options.clipId,
      type: "adjustment",
      startUs: 0,
      inUs: 0,
      outUs: options.photo ? options.minUs : Math.max(options.minUs, comp.durationUs),
      color: {
        ...neutralColor(),
        lut: { lutId: options.lookId, intensity: options.intensity ?? 1 },
      },
    }),
    options.trackId,
    info === undefined ? "Look" : `Look: ${info.name}`,
  );
}
