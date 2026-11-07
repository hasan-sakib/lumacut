import { applyOp } from "@lumacut/ops";
import {
  createClip,
  createComposition,
  createProject,
  createTrack,
  type Asset,
  type Clip,
  type Keyframe,
  type Project,
} from "@lumacut/schema";
import { describe, expect, it } from "vitest";
import { keyStateOf, keyframeToggleOps, localTimeOf, toggleKeyframeOp } from "./animation.ts";
import { fieldById, type ClipInfo } from "./fields.ts";
import { buildInspector, opForField } from "./selection.ts";

const SEC = 1_000_000;
const video: Asset = {
  id: "v1",
  kind: "video",
  name: "clip.mp4",
  mimeType: "video/mp4",
  sizeBytes: 1,
  source: "user",
  video: {
    width: 1920,
    height: 1080,
    fps: { num: 30, den: 1 },
    durationUs: 10 * SEC,
    codec: "avc1",
  },
};

const key = (tUs: number, value: Keyframe["value"]): Keyframe => ({
  tUs,
  value,
  interpolation: "linear",
});

/** A clip from 2 s to 4 s on a picture track. */
function setup(extra: Partial<Clip> = {}): { project: Project; info: ClipInfo } {
  const clip = createClip({
    id: "c",
    type: "media",
    assetId: "v1",
    startUs: 2 * SEC,
    inUs: 0,
    outUs: 2 * SEC,
    ...extra,
  });
  const track = createTrack({ id: "V1", kind: "visual", clips: [clip] });
  const project = createProject({
    id: "p",
    now: "2026-11-07T00:00:00Z",
    assets: [video],
    compositions: [createComposition({ id: "main", width: 1920, height: 1080, tracks: [track] })],
  });
  return { project, info: { clip, track, asset: video } };
}

/** Applies an op to the project and returns the updated clip. */
function run(
  project: Project,
  op: Parameters<typeof applyOp>[1],
): { project: Project; clip: Clip } {
  const next = applyOp(project, op).project;
  const clip = next.compositions[0]?.tracks[0]?.clips[0];
  if (clip === undefined) throw new Error("clip vanished");
  return { project: next, clip };
}

describe("localTimeOf", () => {
  it("is relative to the clip and stays inside it", () => {
    const { info } = setup();
    expect(localTimeOf(info.clip, 3 * SEC)).toBe(SEC);
    expect(localTimeOf(info.clip, 0)).toBe(0);
    expect(localTimeOf(info.clip, 99 * SEC)).toBe(2 * SEC);
  });
});

describe("the ◆ control", () => {
  const opacity = fieldById("opacity");

  it("adds a keyframe holding the current value at the playhead", () => {
    const { project, info } = setup({ opacity: 0.4 });
    const op = toggleKeyframeOp(opacity, [info], 3 * SEC);
    expect(op).toMatchObject({ type: "addKeyframe", path: "opacity" });
    const { clip } = run(project, op as never);
    expect(clip.keyframes.opacity).toEqual([{ tUs: SEC, value: 0.4, interpolation: "linear" }]);
    expect(keyStateOf(opacity, clip, 3 * SEC)).toBe("key");
    expect(keyStateOf(opacity, clip, 3.5 * SEC)).toBe("animated");
    expect(keyStateOf(opacity, info.clip, 3 * SEC)).toBe("none");
  });

  it("removes the keyframe under the playhead, and the last one leaves its value behind", () => {
    const { project, info } = setup({ opacity: 1, keyframes: { opacity: [key(SEC, 0.25)] } });
    const op = toggleKeyframeOp(opacity, [info], 3 * SEC);
    const { clip } = run(project, op as never);
    expect(clip.keyframes.opacity).toBeUndefined();
    expect(clip.opacity).toBe(0.25);
  });

  it("removing one of several keyframes keeps the animation", () => {
    const { project, info } = setup({ keyframes: { opacity: [key(0, 0), key(SEC, 1)] } });
    const { clip } = run(project, toggleKeyframeOp(opacity, [info], 3 * SEC) as never);
    expect(clip.keyframes.opacity?.map((k) => k.tUs)).toEqual([0]);
  });

  it("a new keyframe copies the interpolation of its neighbour", () => {
    const hold: Keyframe = { tUs: 0, value: 0, interpolation: "hold" };
    const { info } = setup({ keyframes: { opacity: [hold, key(2 * SEC, 1)] } });
    const [op] = keyframeToggleOps(opacity, [info], 3 * SEC);
    expect(op).toMatchObject({ keyframe: { interpolation: "hold" } });
  });

  it("keys the whole point for Position X and Position Y (one path, AE-style)", () => {
    const { project, info } = setup();
    const x = fieldById("positionX");
    const y = fieldById("positionY");
    const a = run(project, toggleKeyframeOp(x, [info], 3 * SEC) as never);
    expect(a.clip.keyframes["transform.position"]).toHaveLength(1);
    // Y shares the path, so it sees the same animation.
    expect(keyStateOf(y, a.clip, 3 * SEC)).toBe("key");
  });

  it("works on several selected clips as one op", () => {
    const { info } = setup();
    const other = { ...info, clip: { ...info.clip, id: "d" } };
    const op = toggleKeyframeOp(opacity, [info, other], 3 * SEC);
    expect(op).toMatchObject({ type: "batch" });
  });

  it("does nothing for a field that can't be animated", () => {
    const { info } = setup();
    expect(toggleKeyframeOp(fieldById("blendMode"), [info], 3 * SEC)).toBeNull();
  });
});

describe("editing an animated property", () => {
  it("shows the animated value at the playhead", () => {
    const { info } = setup({ keyframes: { opacity: [key(0, 0), key(2 * SEC, 1)] } });
    const sections = buildInspector([info], {
      query: "",
      showAdvanced: {},
      playheadUs: 3 * SEC,
    });
    const field = sections.flatMap((s) => s.fields).find((f) => f.def.id === "opacity");
    expect(field?.value).toBeCloseTo(0.5, 9);
    expect(field?.keyState).toBe("animated");
    expect(field?.canKey).toBe(true);
  });

  it("updates the keyframe under the playhead", () => {
    const { project, info } = setup({ keyframes: { opacity: [key(0, 0), key(SEC, 1)] } });
    const op = opForField(fieldById("opacity"), 0.6, [info], 3 * SEC);
    expect(op).toMatchObject({ type: "updateKeyframe", tUs: SEC });
    const { clip } = run(project, op as never);
    expect(clip.keyframes.opacity?.[1]?.value).toBe(0.6);
    expect(clip.opacity).toBe(1); // the static value is untouched
  });

  it("adds a keyframe when edited between keyframes", () => {
    const { project, info } = setup({ keyframes: { opacity: [key(0, 0), key(2 * SEC, 1)] } });
    const op = opForField(fieldById("opacity"), 0.9, [info], 3 * SEC);
    expect(op).toMatchObject({ type: "addKeyframe" });
    const { clip } = run(project, op as never);
    expect(clip.keyframes.opacity?.map((k) => k.tUs)).toEqual([0, SEC, 2 * SEC]);
  });

  it("changes one part of an animated point without disturbing the other", () => {
    const { project, info } = setup({
      keyframes: { "transform.position": [key(0, [10, 20]), key(2 * SEC, [110, 220])] },
    });
    const op = opForField(fieldById("positionX"), 500, [info], 3 * SEC);
    const { clip } = run(project, op as never);
    const added = clip.keyframes["transform.position"]?.find((k) => k.tUs === SEC);
    expect(added?.value).toEqual([500, 120]); // y is what the animation gives at 1 s
  });

  it("edits the static value when the property isn't animated", () => {
    const { info } = setup();
    expect(opForField(fieldById("opacity"), 0.3, [info], 3 * SEC)).toMatchObject({
      type: "setProps",
      props: { opacity: 0.3 },
    });
  });

  it("can't add a keyframe off the clip but still reads values there", () => {
    const { info } = setup({ keyframes: { opacity: [key(0, 0.2), key(SEC, 0.8)] } });
    const sections = buildInspector([info], { query: "", showAdvanced: {}, playheadUs: 0 });
    const field = sections.flatMap((s) => s.fields).find((f) => f.def.id === "opacity");
    expect(field?.canKey).toBe(false);
    expect(field?.value).toBe(0.2);
  });
});
