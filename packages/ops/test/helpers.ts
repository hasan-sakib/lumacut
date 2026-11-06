import {
  createClip,
  createComposition,
  createProject,
  createTrack,
  type Asset,
  type Clip,
  type Op,
  type Project,
} from "@lumacut/schema";
import { expect } from "vitest";
import { applyOp } from "../src/index.ts";

export const SEC = 1_000_000;

export const videoAsset: Asset = {
  id: "v1",
  kind: "video",
  name: "clip.mp4",
  mimeType: "video/mp4",
  sizeBytes: 1,
  source: "user",
  video: { width: 1920, height: 1080, fps: { num: 30, den: 1 }, durationUs: 10 * SEC, codec: "avc1" },
  audio: { sampleRate: 48_000, channels: 2, durationUs: 10 * SEC, codec: "aac" },
};
export const audioAsset: Asset = {
  id: "a1",
  kind: "audio",
  name: "music.wav",
  mimeType: "audio/wav",
  sizeBytes: 1,
  source: "user",
  audio: { sampleRate: 48_000, channels: 2, durationUs: 20 * SEC, codec: "pcm" },
};
export const imageAsset: Asset = {
  id: "i1",
  kind: "image",
  name: "photo.png",
  mimeType: "image/png",
  sizeBytes: 1,
  source: "user",
  image: { width: 800, height: 600 },
};

/** A media clip of the 10 s video: `seconds` long on the timeline, from source second `from`. */
export function clip(id: string, startSec: number, seconds: number, extra: Partial<Clip> = {}): Clip {
  const from = extra.inUs ?? 0;
  return createClip({
    id,
    type: "media",
    assetId: "v1",
    startUs: Math.round(startSec * SEC),
    inUs: from,
    outUs: from + Math.round(seconds * SEC * (extra.speed ?? 1)),
    ...extra,
  });
}

/**
 * Composition "main": V1 holds c1 [0,2) c2 [2,4) c3 [4,6) (each 2 s of the video), V2 is empty,
 * A1 (audio) holds a1c [0,2) and a2c [2,4) of the video's sound.
 */
export function sampleProject(): Project {
  return createProject({
    id: "p",
    now: "2026-11-06T00:00:00Z",
    assets: [videoAsset, audioAsset, imageAsset],
    compositions: [
      createComposition({
        id: "main",
        width: 1920,
        height: 1080,
        durationUs: 10 * SEC,
        tracks: [
          createTrack({
            id: "V1",
            kind: "visual",
            clips: [clip("c1", 0, 2), clip("c2", 2, 2, { inUs: 2 * SEC }), clip("c3", 4, 2, { inUs: 4 * SEC })],
          }),
          createTrack({ id: "V2", kind: "visual" }),
          createTrack({
            id: "A1",
            kind: "audio",
            clips: [clip("a1c", 0, 2), clip("a2c", 2, 2, { inUs: 2 * SEC })],
          }),
        ],
      }),
    ],
    mainCompositionId: "main",
  });
}

export function trackClips(project: Project, trackId: string): Clip[] {
  for (const c of project.compositions) {
    const t = c.tracks.find((x) => x.id === trackId);
    if (t) return t.clips;
  }
  throw new Error(`no track ${trackId}`);
}

export function getClip(project: Project, id: string): Clip {
  for (const c of project.compositions) for (const t of c.tracks) for (const k of t.clips) if (k.id === id) return k;
  throw new Error(`no clip ${id}`);
}

/** Applies `op`, checks the inverse restores the project exactly and the input wasn't touched. */
export function roundTrip(project: Project, op: Op): Project {
  const before = structuredClone(project);
  const { project: after, inverse } = applyOp(project, op);
  expect(project).toEqual(before);
  expect(applyOp(after, inverse).project).toEqual(project);
  // And redo: the inverse of the inverse leads back to `after`.
  const undone = applyOp(after, inverse);
  expect(applyOp(undone.project, undone.inverse).project).toEqual(after);
  return after;
}

export function errorCode(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return (error as { code?: string }).code ?? `not an OpError: ${String(error)}`;
  }
  return "no error";
}
