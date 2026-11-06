import { createComposition, createTrack, type Marker, type Op } from "@lumacut/schema";
import { describe, expect, it } from "vitest";
import { OP_ERROR_CODES, OpError, applyOp, validateProject } from "../src/index.ts";
import { SEC, audioAsset, clip, errorCode, getClip, roundTrip, sampleProject, trackClips } from "./helpers.ts";

describe("applyOp basics", () => {
  it("the sample project is valid", () => {
    expect(() => {
      validateProject(sampleProject());
    }).not.toThrow();
  });

  it("never modifies its input and throws OpError with a code", () => {
    const p = sampleProject();
    const before = structuredClone(p);
    try {
      applyOp(p, { type: "removeClip", clipId: "nope" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(OpError);
      expect((error as OpError).code).toBe("unknown_clip");
      expect((error as OpError).message).toMatch(/nope/);
    }
    expect(p).toEqual(before);
  });

  it("every error code is a distinct string", () => {
    expect(new Set(OP_ERROR_CODES).size).toBe(OP_ERROR_CODES.length);
  });
});

describe("clips: add, remove, move", () => {
  it("addClip inserts in start order and undoes", () => {
    const p = sampleProject();
    const after = roundTrip(p, { type: "addClip", trackId: "V1", clip: clip("c4", 7, 1) });
    expect(trackClips(after, "V1").map((c) => c.id)).toEqual(["c1", "c2", "c3", "c4"]);
    const mid = roundTrip(p, { type: "addClip", trackId: "V1", clip: clip("cm", 6, 1) });
    expect(trackClips(mid, "V1").map((c) => c.id)).toEqual(["c1", "c2", "c3", "cm"]);
  });

  it("refuses overlap, duplicate ids, unknown assets and wrong track kinds", () => {
    const p = sampleProject();
    expect(errorCode(() => applyOp(p, { type: "addClip", trackId: "V1", clip: clip("x", 1, 2) }))).toBe("clips_overlap");
    expect(errorCode(() => applyOp(p, { type: "addClip", trackId: "V2", clip: clip("c1", 8, 1) }))).toBe("duplicate_id");
    expect(errorCode(() => applyOp(p, { type: "addClip", trackId: "V2", clip: clip("x", 8, 1, { assetId: "zzz" }) }))).toBe("unknown_asset");
    expect(errorCode(() => applyOp(p, { type: "addClip", trackId: "A1", clip: clip("x", 8, 1, { assetId: "i1" }) }))).toBe("wrong_track_kind");
    expect(errorCode(() => applyOp(p, { type: "addClip", trackId: "V2", clip: clip("x", 8, 1, { assetId: "a1" }) }))).toBe("wrong_track_kind");
    expect(errorCode(() => applyOp(p, { type: "addClip", trackId: "nope", clip: clip("x", 8, 1) }))).toBe("unknown_track");
  });

  it("refuses clips beyond their media and keeps stills unbounded", () => {
    const p = sampleProject();
    expect(errorCode(() => applyOp(p, { type: "addClip", trackId: "V2", clip: clip("x", 0, 1, { inUs: 9.5 * SEC }) }))).toBe("trim_beyond_source");
    const still = clip("img", 0, 1, { type: "media", assetId: "i1", inUs: 0, outUs: 30 * SEC });
    expect(() => applyOp(p, { type: "addClip", trackId: "V2", clip: still })).not.toThrow();
  });

  it("removeClip undoes to the same position", () => {
    const p = sampleProject();
    const after = roundTrip(p, { type: "removeClip", clipId: "c2" });
    expect(trackClips(after, "V1").map((c) => c.id)).toEqual(["c1", "c3"]);
  });

  it("moveClip within a track and across tracks", () => {
    const p = sampleProject();
    const moved = roundTrip(p, { type: "moveClip", clipId: "c3", trackId: "V1", startUs: 7 * SEC });
    expect(getClip(moved, "c3").startUs).toBe(7 * SEC);
    const across = roundTrip(p, { type: "moveClip", clipId: "c1", trackId: "V2", startUs: 3 * SEC });
    expect(trackClips(across, "V2").map((c) => c.id)).toEqual(["c1"]);
    expect(trackClips(across, "V1").map((c) => c.id)).toEqual(["c2", "c3"]);
    expect(errorCode(() => applyOp(p, { type: "moveClip", clipId: "c1", trackId: "V1", startUs: 3 * SEC }))).toBe("clips_overlap");
    expect(errorCode(() => applyOp(p, { type: "moveClip", clipId: "c1", trackId: "A1", startUs: 8 * SEC }))).toBe("wrong_track_kind");
  });
});

describe("locked tracks", () => {
  it("block clip edits until unlocked, and the lock itself undoes", () => {
    const p = sampleProject();
    const locked = roundTrip(p, { type: "setTrackProps", trackId: "V1", props: { locked: true } });
    for (const op of [
      { type: "removeClip", clipId: "c1" },
      { type: "trimClip", clipId: "c1", edge: "end", toUs: 1 * SEC },
      { type: "addClip", trackId: "V1", clip: clip("z", 8, 1) },
      { type: "setProps", clipId: "c1", props: { opacity: 0.5 } },
      { type: "removeTrack", compositionId: "main", trackId: "V1" },
    ] satisfies Op[]) {
      expect(errorCode(() => applyOp(locked, op))).toBe("track_locked");
    }
  });
});

describe("setProps, links, placeholders", () => {
  it("setProps patches and unset removes optional fields; undo restores both", () => {
    const p = sampleProject();
    const a = roundTrip(p, { type: "setProps", clipId: "c1", props: { opacity: 0.4, blendMode: "multiply", freezeAtUs: 1 * SEC } });
    expect(getClip(a, "c1")).toMatchObject({ opacity: 0.4, blendMode: "multiply", freezeAtUs: SEC });
    const b = roundTrip(a, { type: "setProps", clipId: "c1", props: {}, unset: ["freezeAtUs"] });
    expect(getClip(b, "c1").freezeAtUs).toBeUndefined();
    expect("freezeAtUs" in getClip(b, "c1")).toBe(false);
  });

  it("setProps validates the result (speed, ranges)", () => {
    const p = sampleProject();
    expect(errorCode(() => applyOp(p, { type: "setProps", clipId: "c1", props: { speed: 0 } }))).toBe("invalid_speed");
    expect(errorCode(() => applyOp(p, { type: "setProps", clipId: "c1", props: { outUs: 0 } }))).toBe("invalid_range");
    expect(errorCode(() => applyOp(p, { type: "setProps", clipId: "c1", props: { startUs: 1 * SEC } }))).toBe("clips_overlap");
  });

  it("link and unlink are exact inverses; a group id can't be reused by outsiders", () => {
    const p = sampleProject();
    const linked = roundTrip(p, { type: "linkClips", clipIds: ["c1", "a1c"], linkId: "L1" });
    expect(getClip(linked, "a1c").linkId).toBe("L1");
    roundTrip(linked, { type: "unlinkClips", clipIds: ["c1"] });
    expect(errorCode(() => applyOp(linked, { type: "linkClips", clipIds: ["c2", "a2c"], linkId: "L1" }))).toBe("link_id_in_use");
  });

  it("setPlaceholder sets and clears", () => {
    const p = sampleProject();
    const a = roundTrip(p, { type: "setPlaceholder", clipId: "c1", placeholder: { slotId: "s", kind: "media", label: "Hero" } });
    expect(getClip(a, "c1").placeholder?.slotId).toBe("s");
    const b = roundTrip(a, { type: "setPlaceholder", clipId: "c1" });
    expect(getClip(b, "c1").placeholder).toBeUndefined();
  });
});

describe("batch", () => {
  it("is atomic: a failing op leaves nothing applied", () => {
    const p = sampleProject();
    const before = structuredClone(p);
    expect(
      errorCode(() =>
        applyOp(p, {
          type: "batch",
          ops: [
            { type: "setProps", clipId: "c1", props: { opacity: 0.1 } },
            { type: "removeClip", clipId: "missing" },
          ],
        }),
      ),
    ).toBe("unknown_clip");
    expect(p).toEqual(before);
  });

  it("judges invariants on the end state, so a swap through an overlap works", () => {
    const p = sampleProject();
    const after = roundTrip(p, {
      type: "batch",
      label: "swap",
      ops: [
        { type: "moveClip", clipId: "c1", trackId: "V1", startUs: 2 * SEC },
        { type: "moveClip", clipId: "c2", trackId: "V1", startUs: 0 },
      ],
    });
    expect(trackClips(after, "V1").map((c) => c.id)).toEqual(["c2", "c1", "c3"]);
  });

  it("is one undo step whose inverse is a batch with the same label", () => {
    const p = sampleProject();
    const { inverse } = applyOp(p, {
      type: "batch",
      label: "tidy",
      ops: [{ type: "setProps", clipId: "c1", props: { opacity: 0.2 } }, { type: "setProps", clipId: "c2", props: { opacity: 0.3 } }],
    });
    expect(inverse.type).toBe("batch");
    expect((inverse as { label?: string }).label).toBe("tidy");
  });

  it("an empty batch is a no-op", () => {
    const p = sampleProject();
    expect(applyOp(p, { type: "batch", ops: [] }).project).toEqual(p);
  });
});

describe("tracks", () => {
  it("add, remove, reorder and set props all round-trip", () => {
    const p = sampleProject();
    const added = roundTrip(p, { type: "addTrack", compositionId: "main", track: createTrack({ id: "V3", kind: "visual" }), index: 1 });
    expect(added.compositions[0]?.tracks.map((t) => t.id)).toEqual(["V1", "V3", "V2", "A1"]);
    const removed = roundTrip(p, { type: "removeTrack", compositionId: "main", trackId: "V1" });
    expect(removed.compositions[0]?.tracks.map((t) => t.id)).toEqual(["V2", "A1"]);
    const reordered = roundTrip(p, { type: "reorderTrack", compositionId: "main", trackId: "V1", toIndex: 2 });
    expect(reordered.compositions[0]?.tracks.map((t) => t.id)).toEqual(["V2", "A1", "V1"]);
    roundTrip(p, { type: "setTrackProps", trackId: "A1", props: { muted: true, solo: true, name: "Sound" } });
  });

  it("refuses duplicates, bad positions and unknown ids", () => {
    const p = sampleProject();
    expect(errorCode(() => applyOp(p, { type: "addTrack", compositionId: "main", track: createTrack({ id: "V1", kind: "visual" }), index: 0 }))).toBe("duplicate_id");
    expect(errorCode(() => applyOp(p, { type: "addTrack", compositionId: "main", track: createTrack({ id: "V9", kind: "visual" }), index: 9 }))).toBe("invalid_range");
    expect(errorCode(() => applyOp(p, { type: "reorderTrack", compositionId: "main", trackId: "V1", toIndex: 9 }))).toBe("invalid_range");
    expect(errorCode(() => applyOp(p, { type: "removeTrack", compositionId: "other", trackId: "V1" }))).toBe("unknown_track");
    expect(errorCode(() => applyOp(p, { type: "setTrackProps", trackId: "zz", props: { muted: true } }))).toBe("unknown_track");
  });
});

describe("compositions, assets, markers", () => {
  const other = createComposition({ id: "other", width: 640, height: 360, durationUs: SEC });

  it("addComposition / removeComposition restore the exact position", () => {
    const p = sampleProject();
    const added = roundTrip(p, { type: "addComposition", composition: other, index: 0 });
    expect(added.compositions.map((c) => c.id)).toEqual(["other", "main"]);
    roundTrip(added, { type: "removeComposition", compositionId: "other" });
    expect(errorCode(() => applyOp(p, { type: "removeComposition", compositionId: "main" }))).toBe("composition_in_use");
    expect(errorCode(() => applyOp(p, { type: "addComposition", composition: other, index: 5 }))).toBe("invalid_range");
    expect(errorCode(() => applyOp(added, { type: "addComposition", composition: other }))).toBe("duplicate_id");
  });

  it("updateComposition round-trips", () => {
    roundTrip(sampleProject(), { type: "updateComposition", compositionId: "main", props: { width: 1080, height: 1920, name: "Reel", durationUs: 30 * SEC } });
  });

  it("assets: add/remove/update, in-use guard, and update re-validates users", () => {
    const p = sampleProject();
    const extra = { ...audioAsset, id: "a2", name: "b.wav" };
    const added = roundTrip(p, { type: "addAsset", asset: extra, index: 0 });
    expect(added.assets[0]?.id).toBe("a2");
    roundTrip(added, { type: "removeAsset", assetId: "a2" });
    expect(errorCode(() => applyOp(p, { type: "removeAsset", assetId: "v1" }))).toBe("asset_in_use");
    expect(errorCode(() => applyOp(p, { type: "removeAsset", assetId: "zz" }))).toBe("unknown_asset");
    roundTrip(p, { type: "updateAsset", assetId: "v1", props: { name: "renamed.mp4" } });
    roundTrip(p, { type: "updateAsset", assetId: "i1", props: {}, unset: ["image"] });
    // Shortening the media below a clip's out point is refused.
    expect(
      errorCode(() =>
        applyOp(p, {
          type: "updateAsset",
          assetId: "v1",
          props: { video: { width: 1920, height: 1080, fps: { num: 30, den: 1 }, durationUs: 3 * SEC, codec: "avc1" } },
        }),
      ),
    ).toBe("trim_beyond_source");
  });

  it("markers round-trip with their position", () => {
    const p = sampleProject();
    const marker = (id: string, t: number): Marker => ({ id, tUs: t, durationUs: 0, label: id, color: { r: 1, g: 0, b: 0, a: 1 } });
    const one = roundTrip(p, { type: "addMarker", compositionId: "main", marker: marker("m1", SEC) });
    const two = roundTrip(one, { type: "addMarker", compositionId: "main", marker: marker("m2", 2 * SEC), index: 0 });
    expect(two.compositions[0]?.markers.map((m) => m.id)).toEqual(["m2", "m1"]);
    roundTrip(two, { type: "updateMarker", compositionId: "main", marker: { ...marker("m1", 3 * SEC), label: "moved" } });
    roundTrip(two, { type: "removeMarker", compositionId: "main", markerId: "m2" });
    expect(errorCode(() => applyOp(two, { type: "addMarker", compositionId: "main", marker: marker("m1", 0) }))).toBe("duplicate_id");
    expect(errorCode(() => applyOp(two, { type: "removeMarker", compositionId: "main", markerId: "zz" }))).toBe("unknown_marker");
    expect(errorCode(() => applyOp(two, { type: "updateMarker", compositionId: "main", marker: marker("zz", 0) }))).toBe("unknown_marker");
  });
});
