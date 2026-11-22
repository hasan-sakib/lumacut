import { createTrack, type Clip, type Composition, type Op } from "@lumacut/schema";

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
