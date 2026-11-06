import { createClip, createComposition, createTrack, type Keyframe, type Mask, type Op, type Project } from "@lumacut/schema";
import { describe, expect, it } from "vitest";
import { applyOp, endOf, findClip } from "../src/index.ts";
import { SEC, clip, errorCode, getClip, roundTrip, sampleProject, trackClips } from "./helpers.ts";

const times = (p: Project, track: string) => trackClips(p, track).map((c) => [c.id, c.startUs / SEC, endOf(c) / SEC]);

describe("trimClip", () => {
  it("moves the end edge: out point follows at speed 1", () => {
    const p = sampleProject();
    const a = roundTrip(p, { type: "trimClip", clipId: "c1", edge: "end", toUs: 1.5 * SEC });
    expect(getClip(a, "c1")).toMatchObject({ startUs: 0, inUs: 0, outUs: 1.5 * SEC });
  });

  it("moves the start edge: start and in point move together", () => {
    const p = sampleProject();
    const a = roundTrip(p, { type: "trimClip", clipId: "c2", edge: "start", toUs: 2.5 * SEC });
    expect(getClip(a, "c2")).toMatchObject({ startUs: 2.5 * SEC, inUs: 2.5 * SEC, outUs: 4 * SEC });
  });

  it("extends within the source and refuses extending past it", () => {
    const p = sampleProject();
    roundTrip(p, { type: "trimClip", clipId: "c3", edge: "end", toUs: 7 * SEC }); // source out 4s -> 7s
    expect(errorCode(() => applyOp(p, { type: "trimClip", clipId: "c1", edge: "start", toUs: 0 }))).toBe("no error");
    const second = applyOp(p, { type: "moveClip", clipId: "c1", trackId: "V1", startUs: 7 * SEC }).project;
    expect(errorCode(() => applyOp(second, { type: "trimClip", clipId: "c1", edge: "start", toUs: 6 * SEC }))).toBe("trim_beyond_source");
    expect(errorCode(() => applyOp(p, { type: "trimClip", clipId: "c3", edge: "end", toUs: 12 * SEC }))).toBe("trim_beyond_source");
  });

  it("refuses collisions and zero-length results", () => {
    const p = sampleProject();
    expect(errorCode(() => applyOp(p, { type: "trimClip", clipId: "c1", edge: "end", toUs: 3 * SEC }))).toBe("clips_overlap");
    expect(errorCode(() => applyOp(p, { type: "trimClip", clipId: "c1", edge: "end", toUs: 0 }))).toBe("invalid_range");
    expect(errorCode(() => applyOp(p, { type: "trimClip", clipId: "c1", edge: "start", toUs: 2 * SEC }))).toBe("invalid_range");
  });

  it("scales by speed: 2x clip covers twice the source", () => {
    const base = sampleProject();
    const p = applyOp(base, {
      type: "setProps",
      clipId: "c3",
      props: { speed: 2, outUs: 8 * SEC }, // source 4s..8s at 2x = 2 s on the timeline
    }).project;
    expect(endOf(getClip(p, "c3"))).toBe(6 * SEC);
    const a = roundTrip(p, { type: "trimClip", clipId: "c3", edge: "end", toUs: 5 * SEC });
    expect(getClip(a, "c3")).toMatchObject({ inUs: 4 * SEC, outUs: 6 * SEC });
  });

  it("works on reversed clips: the timeline start is the source out point", () => {
    const p = applyOp(sampleProject(), { type: "setProps", clipId: "c2", props: { reversed: true } }).project;
    const head = roundTrip(p, { type: "trimClip", clipId: "c2", edge: "start", toUs: 2.5 * SEC });
    expect(getClip(head, "c2")).toMatchObject({ inUs: 2 * SEC, outUs: 3.5 * SEC });
    const tail = roundTrip(p, { type: "trimClip", clipId: "c2", edge: "end", toUs: 3.5 * SEC });
    expect(getClip(tail, "c2")).toMatchObject({ inUs: 2.5 * SEC, outUs: 4 * SEC });
  });
});

describe("rippleTrim", () => {
  it("end edge: later clips on the track follow, other tracks don't", () => {
    const p = sampleProject();
    const a = roundTrip(p, { type: "rippleTrim", clipId: "c1", edge: "end", toUs: 1 * SEC });
    expect(times(a, "V1")).toEqual([["c1", 0, 1], ["c2", 1, 3], ["c3", 3, 5]]);
    expect(times(a, "A1")).toEqual(times(p, "A1"));
  });

  it("end edge extension pushes later clips right by the added length", () => {
    const p = applyOp(sampleProject(), { type: "trimClip", clipId: "c1", edge: "end", toUs: 1 * SEC }).project;
    const a = roundTrip(p, { type: "rippleTrim", clipId: "c1", edge: "end", toUs: 2 * SEC });
    expect(times(a, "V1")).toEqual([["c1", 0, 2], ["c2", 3, 5], ["c3", 5, 7]]);
  });

  it("start edge keeps the clip's start and shifts the rest by the removed head", () => {
    const p = sampleProject();
    const a = roundTrip(p, { type: "rippleTrim", clipId: "c2", edge: "start", toUs: 3 * SEC });
    expect(getClip(a, "c2")).toMatchObject({ startUs: 2 * SEC, inUs: 3 * SEC, outUs: 4 * SEC });
    expect(times(a, "V1")).toEqual([["c1", 0, 2], ["c2", 2, 3], ["c3", 3, 5]]);
  });
});

describe("rollEdit", () => {
  it("moves the cut between adjacent clips, adjusting both source ranges", () => {
    const p = sampleProject();
    const a = roundTrip(p, { type: "rollEdit", leftClipId: "c1", rightClipId: "c2", toUs: 1.5 * SEC });
    expect(getClip(a, "c1")).toMatchObject({ startUs: 0, outUs: 1.5 * SEC });
    expect(getClip(a, "c2")).toMatchObject({ startUs: 1.5 * SEC, inUs: 1.5 * SEC, outUs: 4 * SEC });
    expect(times(a, "V1")).toEqual([["c1", 0, 1.5], ["c2", 1.5, 4], ["c3", 4, 6]]);
  });

  it("needs adjacent clips on one track and a cut inside both", () => {
    const p = sampleProject();
    expect(errorCode(() => applyOp(p, { type: "rollEdit", leftClipId: "c1", rightClipId: "c3", toUs: 3 * SEC }))).toBe("not_adjacent");
    expect(errorCode(() => applyOp(p, { type: "rollEdit", leftClipId: "c1", rightClipId: "a2c", toUs: 1 * SEC }))).toBe("not_adjacent");
    expect(errorCode(() => applyOp(p, { type: "rollEdit", leftClipId: "c1", rightClipId: "c2", toUs: 4 * SEC }))).toBe("invalid_range");
  });
});

describe("slipClip / slideClip", () => {
  it("slip shifts the source window and keeps the timeline", () => {
    const p = sampleProject();
    const a = roundTrip(p, { type: "slipClip", clipId: "c2", deltaUs: 1 * SEC });
    expect(getClip(a, "c2")).toMatchObject({ startUs: 2 * SEC, inUs: 3 * SEC, outUs: 5 * SEC });
    expect(errorCode(() => applyOp(p, { type: "slipClip", clipId: "c1", deltaUs: -1 }))).toBe("trim_beyond_source");
    expect(errorCode(() => applyOp(p, { type: "slipClip", clipId: "c3", deltaUs: 5 * SEC }))).toBe("trim_beyond_source");
  });

  it("slide moves the clip and trims the adjacent neighbours", () => {
    const p = sampleProject();
    const a = roundTrip(p, { type: "slideClip", clipId: "c2", deltaUs: 0.5 * SEC });
    expect(times(a, "V1")).toEqual([["c1", 0, 2.5], ["c2", 2.5, 4.5], ["c3", 4.5, 6]]);
    expect(getClip(a, "c3").inUs).toBe(4.5 * SEC);
    const back = roundTrip(p, { type: "slideClip", clipId: "c2", deltaUs: -0.5 * SEC });
    expect(times(back, "V1")).toEqual([["c1", 0, 1.5], ["c2", 1.5, 3.5], ["c3", 3.5, 6]]);
  });

  it("slide leaves a side that wasn't adjacent alone", () => {
    const p = sampleProject();
    const a = roundTrip(p, { type: "slideClip", clipId: "c3", deltaUs: 1 * SEC });
    expect(times(a, "V1")).toEqual([["c1", 0, 2], ["c2", 2, 5], ["c3", 5, 7]]);
    expect(errorCode(() => applyOp(p, { type: "slideClip", clipId: "c1", deltaUs: -1 }))).toBe("invalid_time");
  });
});

describe("splitClip", () => {
  it("cuts into two touching clips with the right source ranges", () => {
    const p = sampleProject();
    const a = roundTrip(p, { type: "splitClip", clipId: "c2", atUs: 3 * SEC, newClipId: "c2b" });
    expect(getClip(a, "c2")).toMatchObject({ startUs: 2 * SEC, inUs: 2 * SEC, outUs: 3 * SEC });
    expect(getClip(a, "c2b")).toMatchObject({ startUs: 3 * SEC, inUs: 3 * SEC, outUs: 4 * SEC });
    expect(trackClips(a, "V1").map((c) => c.id)).toEqual(["c1", "c2", "c2b", "c3"]);
  });

  it("reversed clips play their later source first", () => {
    const p = applyOp(sampleProject(), { type: "setProps", clipId: "c2", props: { reversed: true } }).project;
    const a = roundTrip(p, { type: "splitClip", clipId: "c2", atUs: 3 * SEC, newClipId: "c2b" });
    expect(getClip(a, "c2")).toMatchObject({ inUs: 3 * SEC, outUs: 4 * SEC });
    expect(getClip(a, "c2b")).toMatchObject({ inUs: 2 * SEC, outUs: 3 * SEC });
  });

  it("partitions keyframes (clip-local), moves the fade-out and drops transition and link", () => {
    const kf = (t: number, v: number): Keyframe => ({ tUs: t, value: v, interpolation: "linear" });
    const p = applyOp(sampleProject(), {
      type: "setProps",
      clipId: "c2",
      props: {
        keyframes: { "transform.x": [kf(0, 0), kf(0.5 * SEC, 5), kf(1.5 * SEC, 9)], opacity: [kf(1_200_000, 1)] },
        audio: { volume: 1, pan: 0, fadeInUs: 100, fadeOutUs: 200, effects: [] },
        linkId: "L",
        transitionIn: { id: "t1", transitionId: "dissolve", durationUs: 500_000, alignment: "end", params: {} },
      },
    }).project;
    const a = roundTrip(p, { type: "splitClip", clipId: "c2", atUs: 3 * SEC, newClipId: "c2b" });
    const first = getClip(a, "c2");
    const second = getClip(a, "c2b");
    expect(first.keyframes["transform.x"]?.map((k) => k.tUs)).toEqual([0, 0.5 * SEC]);
    expect(first.keyframes.opacity).toBeUndefined();
    expect(second.keyframes["transform.x"]?.map((k) => k.tUs)).toEqual([0.5 * SEC]);
    expect(second.keyframes.opacity?.map((k) => k.tUs)).toEqual([200_000]);
    expect(first.audio).toMatchObject({ fadeInUs: 100, fadeOutUs: 0 });
    expect(second.audio).toMatchObject({ fadeInUs: 0, fadeOutUs: 200 });
    expect(first.transitionIn?.id).toBe("t1");
    expect(second.transitionIn).toBeUndefined();
    expect(first.linkId).toBe("L");
    expect(second.linkId).toBeUndefined();
  });

  it("refuses cuts outside or on the edge, and reused ids", () => {
    const p = sampleProject();
    for (const at of [2 * SEC, 4 * SEC, 5 * SEC]) {
      expect(errorCode(() => applyOp(p, { type: "splitClip", clipId: "c2", atUs: at, newClipId: "n" }))).toBe("split_out_of_range");
    }
    expect(errorCode(() => applyOp(p, { type: "splitClip", clipId: "c2", atUs: 3 * SEC, newClipId: "c1" }))).toBe("duplicate_id");
  });
});

describe("rippleDelete", () => {
  it("clips: removes them and closes each gap on its track", () => {
    const p = sampleProject();
    const a = roundTrip(p, { type: "rippleDelete", compositionId: "main", target: { kind: "clips", clipIds: ["c2"] } });
    expect(times(a, "V1")).toEqual([["c1", 0, 2], ["c3", 2, 4]]);
    const two = roundTrip(p, { type: "rippleDelete", compositionId: "main", target: { kind: "clips", clipIds: ["c1", "c3", "a1c"] } });
    expect(times(two, "V1")).toEqual([["c2", 0, 2]]);
    expect(times(two, "A1")).toEqual([["a2c", 0, 2]]);
  });

  it("range: trims, splits a spanning clip, shifts the rest, only on the listed tracks", () => {
    const p = sampleProject();
    const a = roundTrip(p, {
      type: "rippleDelete",
      compositionId: "main",
      target: { kind: "range", startUs: 1 * SEC, endUs: 3 * SEC, trackIds: ["V1"] },
    });
    // c1 keeps [0,1), c2 loses its first second ([3,4) -> [1,2)), c3 shifts 2 s left.
    expect(times(a, "V1")).toEqual([["c1", 0, 1], ["c2", 1, 2], ["c3", 2, 4]]);
    expect(getClip(a, "c2").inUs).toBe(3 * SEC);
    expect(times(a, "A1")).toEqual(times(p, "A1"));

    const inside = roundTrip(p, {
      type: "rippleDelete",
      compositionId: "main",
      target: { kind: "range", startUs: 2.5 * SEC, endUs: 3.5 * SEC, trackIds: ["V1"] },
    });
    expect(times(inside, "V1")).toEqual([["c1", 0, 2], ["c2", 2, 2.5], ["c2-r3500000", 2.5, 3], ["c3", 3, 5]]);
  });

  it("refuses locked tracks, bad ranges and foreign ids", () => {
    const p = sampleProject();
    expect(errorCode(() => applyOp(p, { type: "rippleDelete", compositionId: "main", target: { kind: "range", startUs: 3, endUs: 3, trackIds: ["V1"] } }))).toBe("invalid_range");
    expect(errorCode(() => applyOp(p, { type: "rippleDelete", compositionId: "main", target: { kind: "clips", clipIds: ["zz"] } }))).toBe("unknown_clip");
    expect(errorCode(() => applyOp(p, { type: "rippleDelete", compositionId: "nope", target: { kind: "clips", clipIds: ["c1"] } }))).toBe("unknown_composition");
  });
});

describe("precompose", () => {
  const op: Op = { type: "precompose", compositionId: "main", clipIds: ["c1", "c2", "a1c"], newCompositionId: "nest", newCompositionName: "Nest", newClipId: "nc" };

  it("moves the clips into a new composition and leaves one nested clip; undo restores everything", () => {
    const p = sampleProject();
    const a = roundTrip(p, op);
    const nest = a.compositions.find((c) => c.id === "nest");
    expect(nest?.durationUs).toBe(4 * SEC);
    expect(nest?.tracks.map((t) => t.kind)).toEqual(["visual", "audio"]);
    expect(nest?.tracks.flatMap((t) => t.clips.map((c) => [c.id, c.startUs]))).toEqual([["c1", 0], ["c2", 2 * SEC], ["a1c", 0]]);
    expect(getClip(a, "nc")).toMatchObject({ type: "composition", compositionId: "nest", startUs: 0, outUs: 4 * SEC });
    expect(trackClips(a, "V1").map((c) => c.id)).toEqual(["nc", "c3"]);
    expect(findClip(a, "c1")?.composition.id).toBe("nest");
  });

  it("refuses audio-only selections, foreign clips and reused ids", () => {
    const p = sampleProject();
    expect(errorCode(() => applyOp(p, { ...op, clipIds: ["a1c"] } as Op))).toBe("wrong_track_kind");
    expect(errorCode(() => applyOp(p, { ...op, clipIds: ["zz"] } as Op))).toBe("unknown_clip");
    expect(errorCode(() => applyOp(p, { ...op, newCompositionId: "main" } as Op))).toBe("duplicate_id");
    expect(errorCode(() => applyOp(p, { ...op, newClipId: "c1" } as Op))).toBe("duplicate_id");
  });

  it("refuses when the nested clip would collide with a clip left behind", () => {
    const p = sampleProject();
    expect(errorCode(() => applyOp(p, { ...op, clipIds: ["c1", "c3"] } as Op))).toBe("clips_overlap");
  });
});

describe("composition clips and cycles", () => {
  it("a nested composition clip is valid and a cycle is refused", () => {
    const base = sampleProject();
    const inner = createComposition({ id: "inner", width: 640, height: 360, durationUs: SEC, tracks: [createTrack({ id: "IV", kind: "visual" })] });
    const withInner = roundTrip(base, { type: "addComposition", composition: inner });
    const nested = createClip({ id: "n1", type: "composition", compositionId: "inner", startUs: 8 * SEC, inUs: 0, outUs: SEC });
    const placed = roundTrip(withInner, { type: "addClip", trackId: "V2", clip: nested });
    const cyc = createClip({ id: "n2", type: "composition", compositionId: "main", startUs: 0, inUs: 0, outUs: SEC });
    expect(errorCode(() => applyOp(placed, { type: "addClip", trackId: "IV", clip: cyc }))).toBe("composition_cycle");
    expect(errorCode(() => applyOp(placed, { type: "removeComposition", compositionId: "inner" }))).toBe("composition_in_use");
    const ghost = createClip({ id: "n3", type: "composition", compositionId: "ghost", startUs: 0, inUs: 0, outUs: SEC });
    expect(errorCode(() => applyOp(withInner, { type: "addClip", trackId: "V2", clip: ghost }))).toBe("unknown_composition");
  });
});

describe("keyframes, masks, effects, transitions, paint", () => {
  const kf = (t: number, v: number): Keyframe => ({ tUs: t, value: v, interpolation: "linear" });

  it("keyframes stay sorted, are unique per time, and an emptied path disappears", () => {
    const p = sampleProject();
    const a = roundTrip(p, { type: "addKeyframe", clipId: "c1", path: "opacity", keyframe: kf(SEC, 1) });
    const b = roundTrip(a, { type: "addKeyframe", clipId: "c1", path: "opacity", keyframe: kf(0, 0) });
    expect(getClip(b, "c1").keyframes.opacity?.map((k) => k.tUs)).toEqual([0, SEC]);
    expect(errorCode(() => applyOp(b, { type: "addKeyframe", clipId: "c1", path: "opacity", keyframe: kf(SEC, 0.5) }))).toBe("keyframe_exists");
    const moved = roundTrip(b, { type: "updateKeyframe", clipId: "c1", path: "opacity", tUs: SEC, keyframe: kf(0.5 * SEC, 0.7) });
    expect(getClip(moved, "c1").keyframes.opacity?.map((k) => k.tUs)).toEqual([0, 0.5 * SEC]);
    expect(errorCode(() => applyOp(b, { type: "updateKeyframe", clipId: "c1", path: "opacity", tUs: 0, keyframe: kf(SEC, 1) }))).toBe("keyframe_exists");
    expect(errorCode(() => applyOp(b, { type: "updateKeyframe", clipId: "c1", path: "opacity", tUs: 7, keyframe: kf(9, 1) }))).toBe("unknown_keyframe");
    const one = applyOp(a, { type: "removeKeyframe", clipId: "c1", path: "opacity", tUs: SEC }).project;
    expect("opacity" in getClip(one, "c1").keyframes).toBe(false);
    roundTrip(b, { type: "removeKeyframe", clipId: "c1", path: "opacity", tUs: 0 });
    expect(errorCode(() => applyOp(p, { type: "removeKeyframe", clipId: "c1", path: "opacity", tUs: 0 }))).toBe("unknown_keyframe");
  });

  it("masks: add at an index, update, remove", () => {
    const mask = (id: string): Mask => ({
      kind: "raster",
      id,
      assetId: "i1",
      mode: "add",
      feather: 0,
      expansion: 0,
      opacity: 1,
      inverted: false,
    });
    const p = sampleProject();
    const a = roundTrip(p, { type: "addMask", clipId: "c1", mask: mask("m1") });
    const b = roundTrip(a, { type: "addMask", clipId: "c1", mask: mask("m2"), index: 0 });
    expect(getClip(b, "c1").masks.map((m) => m.id)).toEqual(["m2", "m1"]);
    roundTrip(b, { type: "updateMask", clipId: "c1", maskId: "m1", mask: { ...mask("m1"), feather: 5 } });
    roundTrip(b, { type: "removeMask", clipId: "c1", maskId: "m2" });
    expect(errorCode(() => applyOp(b, { type: "addMask", clipId: "c1", mask: mask("m1") }))).toBe("duplicate_id");
    expect(errorCode(() => applyOp(b, { type: "updateMask", clipId: "c1", maskId: "m1", mask: mask("other") }))).toBe("invalid_op");
    expect(errorCode(() => applyOp(b, { type: "removeMask", clipId: "c1", maskId: "zz" }))).toBe("unknown_mask");
  });

  it("effects: add, merge params, toggle, reorder, remove", () => {
    const fx = (id: string) => ({ id, effectId: "blur", enabled: true, params: { radius: 4, mode: "box" } });
    const p = sampleProject();
    const a = roundTrip(p, { type: "addEffect", clipId: "c1", effect: fx("e1") });
    const b = roundTrip(a, { type: "addEffect", clipId: "c1", effect: fx("e2"), index: 0 });
    expect(getClip(b, "c1").effects.map((e) => e.id)).toEqual(["e2", "e1"]);
    const upd = roundTrip(b, { type: "updateEffect", clipId: "c1", effectId: "e1", props: { enabled: false, params: { radius: 9 } } });
    expect(getClip(upd, "c1").effects[1]).toMatchObject({ enabled: false, params: { radius: 9, mode: "box" } });
    const re = roundTrip(b, { type: "reorderEffect", clipId: "c1", effectId: "e2", toIndex: 1 });
    expect(getClip(re, "c1").effects.map((e) => e.id)).toEqual(["e1", "e2"]);
    roundTrip(b, { type: "removeEffect", clipId: "c1", effectId: "e1" });
    expect(errorCode(() => applyOp(b, { type: "addEffect", clipId: "c1", effect: fx("e1") }))).toBe("duplicate_id");
    expect(errorCode(() => applyOp(b, { type: "updateEffect", clipId: "c1", effectId: "zz", props: {} }))).toBe("unknown_effect");
    expect(errorCode(() => applyOp(b, { type: "reorderEffect", clipId: "c1", effectId: "e1", toIndex: 5 }))).toBe("invalid_range");
  });

  it("transitions set, clear, and can't outlast the clip", () => {
    const p = sampleProject();
    const t = { id: "t1", transitionId: "dissolve", durationUs: SEC, alignment: "end" as const, params: {} };
    const a = roundTrip(p, { type: "setTransition", clipId: "c2", transition: t });
    expect(getClip(a, "c2").transitionIn?.id).toBe("t1");
    const b = roundTrip(a, { type: "setTransition", clipId: "c2" });
    expect(getClip(b, "c2").transitionIn).toBeUndefined();
    expect(errorCode(() => applyOp(p, { type: "setTransition", clipId: "c2", transition: { ...t, durationUs: 3 * SEC } }))).toBe("invalid_range");
  });

  it("paint strokes need a paint clip", () => {
    const p = sampleProject();
    const stroke = (id: string) => ({ id, tool: "brush" as const, color: { r: 0, g: 0, b: 0, a: 1 }, size: 4, hardness: 1, opacity: 1, points: [0, 0, 1] });
    const paintClip = createClip({ id: "pc", type: "paint", startUs: 8 * SEC, inUs: 0, outUs: SEC });
    const withPaint = applyOp(p, { type: "addClip", trackId: "V2", clip: paintClip }).project;
    const a = roundTrip(withPaint, { type: "addPaintStrokes", clipId: "pc", strokes: [stroke("s1"), stroke("s2")] });
    roundTrip(a, { type: "removePaintStrokes", clipId: "pc", strokeIds: ["s1"] });
    expect(errorCode(() => applyOp(a, { type: "addPaintStrokes", clipId: "pc", strokes: [stroke("s1")] }))).toBe("duplicate_id");
    expect(errorCode(() => applyOp(a, { type: "removePaintStrokes", clipId: "pc", strokeIds: ["zz"] }))).toBe("invalid_op");
    expect(errorCode(() => applyOp(p, { type: "addPaintStrokes", clipId: "c1", strokes: [stroke("s")] }))).toBe("not_a_paint_clip");
  });
});
