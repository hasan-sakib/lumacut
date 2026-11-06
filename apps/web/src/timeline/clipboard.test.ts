import { applyOp } from "@lumacut/ops";
import { createClip, createComposition, createProject, createTrack, type Asset, type Clip, type Project } from "@lumacut/schema";
import { describe, expect, it } from "vitest";
import { copyAttributes, copyClips, pasteAttributesOps, pasteOps } from "./clipboard.ts";

const SEC = 1_000_000;
const video: Asset = {
  id: "v1",
  kind: "video",
  name: "clip.mp4",
  mimeType: "video/mp4",
  sizeBytes: 1,
  source: "user",
  video: { width: 1920, height: 1080, fps: { num: 30, den: 1 }, durationUs: 20 * SEC, codec: "avc1" },
  audio: { sampleRate: 48_000, channels: 2, durationUs: 20 * SEC, codec: "aac" },
};
const media = (id: string, start: number, len: number, extra: Partial<Clip> = {}): Clip =>
  createClip({ id, type: "media", assetId: "v1", startUs: start * SEC, inUs: 0, outUs: len * SEC, ...extra });

function project(locked = false): Project {
  return createProject({
    id: "p",
    now: "2026-11-06T00:00:00Z",
    assets: [video],
    compositions: [
      createComposition({
        id: "main",
        width: 1920,
        height: 1080,
        durationUs: 20 * SEC,
        tracks: [
          createTrack({ id: "V1", kind: "visual", locked, clips: [media("c1", 0, 2, { linkId: "L" }), media("c2", 2, 2)] }),
          createTrack({ id: "V2", kind: "visual" }),
          createTrack({ id: "A1", kind: "audio", clips: [media("a1", 0, 2, { linkId: "L" })] }),
        ],
      }),
    ],
    mainCompositionId: "main",
  });
}

let n = 0;
const newId = () => `n${String(++n)}`;
const comp = (p: Project) => p.compositions[0]!;
const apply = (p: Project, ops: ReturnType<typeof pasteOps>) => applyOp(p, { type: "batch", ops }).project;
const clipsOn = (p: Project, id: string) => comp(p).tracks.find((t) => t.id === id)?.clips ?? [];

describe("copyClips", () => {
  it("clones the clips and remembers the earliest start", () => {
    const p = project();
    const data = copyClips(comp(p), ["c2", "c1"]);
    expect(data?.originUs).toBe(0);
    expect(data?.clips.map((c) => c.clip.id)).toEqual(["c1", "c2"]);
    (data?.clips[0]?.clip as Clip).opacity = 0.1;
    expect(comp(p).tracks[0]?.clips[0]?.opacity).toBe(1); // the project wasn't touched
    expect(copyClips(comp(p), ["nope"])).toBeNull();
  });
});

describe("pasteOps", () => {
  it("puts the first clip at the playhead on its own track when free, keeping relative timing", () => {
    n = 0;
    const p = project();
    const data = copyClips(comp(p), ["c2"]);
    const after = apply(p, pasteOps(comp(p), data!, 10 * SEC, newId));
    const pasted = clipsOn(after, "V1").find((c) => c.startUs === 10 * SEC);
    expect(pasted?.id).not.toBe("c2");
    expect(pasted?.assetId).toBe("v1");
    expect(clipsOn(after, "V1")).toHaveLength(3);
  });

  it("moves to another free track of the same kind when the home track is busy", () => {
    n = 0;
    const p = project();
    const data = copyClips(comp(p), ["c2"]);
    const after = apply(p, pasteOps(comp(p), data!, 2 * SEC, newId)); // V1 is occupied at 2 s
    expect(clipsOn(after, "V1")).toHaveLength(2);
    expect(clipsOn(after, "V2")).toHaveLength(1);
    expect(clipsOn(after, "V2")[0]?.startUs).toBe(2 * SEC);
  });

  it("makes a new track when no track of that kind is free, and skips locked tracks", () => {
    n = 0;
    const p = project(true); // V1 locked, V2 free
    const data = copyClips(comp(p), ["c2"]);
    const first = apply(p, pasteOps(comp(p), data!, 10 * SEC, newId));
    expect(clipsOn(first, "V1")).toHaveLength(2); // locked: untouched
    expect(clipsOn(first, "V2")).toHaveLength(1);
    // paste again on the same spot: V2 is now busy too, so a third picture track appears
    const second = apply(first, pasteOps(comp(first), data!, 10 * SEC, newId));
    const visual = comp(second).tracks.filter((t) => t.kind === "visual");
    expect(visual).toHaveLength(3);
    expect(comp(second).tracks.at(-1)?.clips[0]?.startUs).toBe(10 * SEC);
  });

  it("a copied linked pair is re-linked to each other, not to the originals", () => {
    n = 0;
    const p = project();
    const data = copyClips(comp(p), ["c1", "a1"]);
    const after = apply(p, pasteOps(comp(p), data!, 10 * SEC, newId));
    const video = clipsOn(after, "V1").find((c) => c.startUs === 10 * SEC);
    const audio = clipsOn(after, "A1").find((c) => c.startUs === 10 * SEC);
    expect(video?.linkId).toBeDefined();
    expect(video?.linkId).toBe(audio?.linkId);
    expect(video?.linkId).not.toBe("L");
  });

  it("a clip whose partner wasn't copied is pasted unlinked", () => {
    n = 0;
    const p = project();
    const data = copyClips(comp(p), ["c1"]);
    const after = apply(p, pasteOps(comp(p), data!, 10 * SEC, newId));
    expect(clipsOn(after, "V1").find((c) => c.startUs === 10 * SEC)?.linkId).toBeUndefined();
  });

  it("keeps a transition only when the clip before it was copied as well", () => {
    n = 0;
    const base = project();
    const t = { id: "t1", transitionId: "dissolve", durationUs: SEC / 2, alignment: "end" as const, params: {} };
    const withT = applyOp(base, { type: "setTransition", clipId: "c2", transition: t }).project;
    const both = pasteOps(comp(withT), copyClips(comp(withT), ["c1", "c2"])!, 10 * SEC, newId);
    const clips = both.flatMap((o) => (o.type === "addClip" ? [o.clip] : []));
    expect(clips.filter((c) => c.transitionIn !== undefined)).toHaveLength(1);
    const alone = pasteOps(comp(withT), copyClips(comp(withT), ["c2"])!, 10 * SEC, newId);
    expect(alone.flatMap((o) => (o.type === "addClip" ? [o.clip] : [])).every((c) => c.transitionIn === undefined)).toBe(true);
  });

  it("every pasted id is new, and undoing the paste restores the project exactly", () => {
    n = 0;
    const p = project();
    const data = copyClips(comp(p), ["c1", "c2", "a1"]);
    const ops = pasteOps(comp(p), data!, 10 * SEC, newId);
    const ids = ops.flatMap((o) => (o.type === "addClip" ? [o.clip.id] : []));
    expect(new Set(ids).size).toBe(ids.length);
    const { project: after, inverse } = applyOp(p, { type: "batch", ops });
    expect(applyOp(after, inverse).project).toEqual(p);
  });
});

describe("attributes", () => {
  it("copies the look of a clip and pastes picture attributes onto picture clips only", () => {
    const base = project();
    const styled = applyOp(base, { type: "setProps", clipId: "c1", props: { opacity: 0.4, blendMode: "screen", transform: { x: 50, y: 0, scaleX: 2, scaleY: 2, rotation: 10, anchorX: 0, anchorY: 0, skew: 0 } } }).project;
    const attrs = copyAttributes(comp(styled).tracks[0]!.clips[0]!, "visual");
    expect(attrs.picture).toMatchObject({ opacity: 0.4, blendMode: "screen" });
    expect(Object.keys(attrs.audio)).toEqual([]);
    const ops = pasteAttributesOps(comp(styled), attrs, ["c2", "a1"]);
    expect(ops).toHaveLength(1); // the audio clip has no audio attributes to receive
    const after = applyOp(styled, { type: "batch", ops }).project;
    expect(clipsOn(after, "V1")[1]).toMatchObject({ opacity: 0.4, blendMode: "screen" });
    expect(clipsOn(after, "V1")[1]?.transform.scaleX).toBe(2);
  });

  it("audio attributes go to audio clips", () => {
    const base = project();
    const loud = applyOp(base, { type: "setProps", clipId: "a1", props: { audio: { volume: 2, pan: 0.5, fadeInUs: 0, fadeOutUs: 0, effects: [] } } }).project;
    const attrs = copyAttributes(comp(loud).tracks[2]!.clips[0]!, "audio");
    expect(attrs.audio).toMatchObject({ audio: { volume: 2 } });
    const ops = pasteAttributesOps(comp(base), attrs, ["a1", "c1"]);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ clipId: "a1" });
  });

  it("copies are independent of the source clip", () => {
    const p = project();
    const clip = comp(p).tracks[0]!.clips[0]!;
    const attrs = copyAttributes(clip, "visual");
    (attrs.picture as { opacity: number }).opacity = 0.01;
    expect(clip.opacity).toBe(1);
  });
});
