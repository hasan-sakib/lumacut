import { describe, expect, it } from "vitest";
import { OP_TYPES } from "../src/index.ts";

// SPEC §4 "Ops" list, verbatim. The schema may add ops (logged in PROGRESS.md) but never drop one.
const SPEC_OPS = [
  "addComposition",
  "addTrack",
  "removeTrack",
  "reorderTrack",
  "addClip",
  "removeClip",
  "moveClip",
  "trimClip",
  "rippleTrim",
  "rollEdit",
  "slipClip",
  "slideClip",
  "splitClip",
  "rippleDelete",
  "setProps",
  "addKeyframe",
  "updateKeyframe",
  "removeKeyframe",
  "addMask",
  "updateMask",
  "addEffect",
  "updateEffect",
  "removeEffect",
  "reorderEffect",
  "setTransition",
  "precompose",
  "addAsset",
  "batch",
];

const ADDED_OPS = [
  "updateComposition",
  "removeComposition",
  "updateAsset",
  "removeAsset",
  "addMarker",
  "updateMarker",
  "removeMarker",
  "setTrackProps",
  "linkClips",
  "unlinkClips",
  "setPlaceholder",
  "removeMask",
  "addPaintStrokes",
  "removePaintStrokes",
];

describe("op catalogue", () => {
  it("contains every op listed in SPEC §4", () => {
    expect(OP_TYPES).toEqual(expect.arrayContaining(SPEC_OPS));
  });

  it("contains exactly the spec ops plus the approved additions", () => {
    expect([...OP_TYPES].sort()).toEqual([...SPEC_OPS, ...ADDED_OPS].sort());
    expect(new Set(OP_TYPES).size).toBe(OP_TYPES.length);
  });
});
