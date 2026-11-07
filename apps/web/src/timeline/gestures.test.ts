import { applyOp } from "@lumacut/ops";
import {
  createClip,
  createComposition,
  createProject,
  createTrack,
  type Asset,
  type Clip,
  type Project,
} from "@lumacut/schema";
import { describe, expect, it } from "vitest";
import {
  moveGesture,
  previewGesture,
  razorGesture,
  rollGesture,
  slideGesture,
  slipGesture,
  snapExclusions,
  trimGesture,
  type GestureEnv,
} from "./gestures.ts";
import { snapPoints } from "./snapping.ts";
import { must } from "../lib/must.ts";

const SEC = 1_000_000;
const fps = { num: 30, den: 1 };
const video: Asset = {
  id: "v1",
  kind: "video",
  name: "clip.mp4",
  mimeType: "video/mp4",
  sizeBytes: 1,
  source: "user",
  video: { width: 1920, height: 1080, fps, durationUs: 10 * SEC, codec: "avc1" },
  audio: { sampleRate: 48_000, channels: 2, durationUs: 10 * SEC, codec: "aac" },
};

const media = (id: string, start: number, len: number, extra: Partial<Clip> = {}): Clip =>
  createClip({
    id,
    type: "media",
    assetId: "v1",
    startUs: Math.round(start * SEC),
    inUs: extra.inUs ?? 0,
    outUs: (extra.inUs ?? 0) + Math.round(len * SEC),
    ...extra,
  });

function project(): Project {
  return createProject({
    id: "p",
    now: "2026-11-06T00:00:00Z",
    assets: [video],
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
            clips: [
              media("c1", 0, 2, { linkId: "L" }),
              media("c2", 2, 2, { inUs: 2 * SEC }),
              media("c3", 6, 2, { inUs: 4 * SEC }),
            ],
          }),
          createTrack({ id: "V2", kind: "visual" }),
          createTrack({ id: "A1", kind: "audio", clips: [media("a1", 0, 2, { linkId: "L" })] }),
        ],
      }),
    ],
    mainCompositionId: "main",
  });
}

let ids = 0;
function env(p: Project, over: Partial<GestureEnv> = {}, exclude: string[] = []): GestureEnv {
  const composition = must(p.compositions[0]);
  return {
    composition,
    snapPoints: snapPoints(composition, { excludeClipIds: exclude, playheadUs: 5 * SEC }),
    thresholdUs: 100_000,
    snapping: true,
    fps,
    newId: () => `n${String(++ids)}`,
    ...over,
  };
}

/** Applies the gesture's op, as releasing the mouse would. */
function commit(p: Project, op: NonNullable<ReturnType<typeof moveGesture>>["op"]): Project {
  return applyOp(p, op).project;
}
const start = (p: Project, id: string) =>
  p.compositions[0]?.tracks.flatMap((t) => t.clips).find((c) => c.id === id)?.startUs;

describe("moveGesture", () => {
  it("moves the grabbed clip and its linked partner by the same amount", () => {
    const p = project();
    const r = moveGesture(env(p, {}, snapExclusions(must(p.compositions[0]), "move", "c1", [])), {
      clipId: "c1",
      selectedIds: [],
      deltaUs: 8 * SEC + 20_000,
    });
    // c1 [0,2) + a1 linked; target start ~8 s. Snap points exclude them; nothing near 8 → frame-rounded.
    expect(r?.op).toMatchObject({ type: "batch", label: "Move clips" });
    const after = commit(p, must(r).op);
    expect(start(after, "c1")).toBe(start(after, "a1"));
    expect(start(after, "c1")).toBeGreaterThan(7.9 * SEC);
  });

  it("snaps the start or end to a nearby edge and reports it", () => {
    const p = project();
    // c3 [6,8) dragged so its start is near c2's end (4 s): delta -2 s + 40 ms
    const r = moveGesture(env(p, {}, ["c3"]), {
      clipId: "c3",
      selectedIds: [],
      deltaUs: -2 * SEC + 40_000,
    });
    expect(r?.snappedTo).toBe(4 * SEC);
    expect(start(commit(p, must(r).op), "c3")).toBe(4 * SEC);
  });

  it("with snapping off lands on a frame instead", () => {
    const p = project();
    const r = moveGesture(env(p, { snapping: false }), {
      clipId: "c3",
      selectedIds: [],
      deltaUs: -2 * SEC + 40_000,
    });
    expect(r?.snappedTo).toBeNull();
    expect(start(commit(p, must(r).op), "c3")).toBe(4_033_333); // frame 121 at 30 fps
  });

  it("can't go before time zero", () => {
    const p = project();
    // (on the empty lane, so it doesn't collide with c1 at 0)
    const r = moveGesture(env(p, { snapping: false }), {
      clipId: "c3",
      selectedIds: [],
      deltaUs: -100 * SEC,
      targetTrackId: "V2",
    });
    expect(start(commit(p, must(r).op), "c3")).toBe(0);
  });

  it("moves the whole selection together", () => {
    const p = project();
    const r = moveGesture(env(p, { snapping: false }), {
      clipId: "c2",
      selectedIds: ["c2", "c3"],
      deltaUs: 1 * SEC,
    });
    const after = commit(p, must(r).op);
    expect(start(after, "c2")).toBe(3 * SEC);
    expect(start(after, "c3")).toBe(7 * SEC);
  });

  it("moves the grabbed clip to another lane of the same kind, never to a different kind", () => {
    const p = project();
    const up = moveGesture(env(p, { snapping: false }), {
      clipId: "c3",
      selectedIds: [],
      deltaUs: 0,
      targetTrackId: "V2",
    });
    expect(up?.op).toMatchObject({ type: "moveClip", trackId: "V2" });
    const wrong = moveGesture(env(p, { snapping: false }), {
      clipId: "c3",
      selectedIds: [],
      deltaUs: 0,
      targetTrackId: "A1",
    });
    expect(wrong).toBeNull(); // audio lane is refused and nothing else changed
  });

  it("returns null when nothing would change, or for an unknown clip", () => {
    const p = project();
    expect(
      moveGesture(env(p, { snapping: false }), { clipId: "c2", selectedIds: [], deltaUs: 5_000 }),
    ).toBeNull();
    expect(moveGesture(env(p), { clipId: "zz", selectedIds: [], deltaUs: SEC })).toBeNull();
  });
});

describe("trimGesture", () => {
  it("trims an edge, snapping to a neighbour", () => {
    const p = project();
    // c3's start dragged to 4.95 s: the playhead (5 s) is the nearest snap point
    const r = trimGesture(env(p, {}, ["c3"]), {
      clipId: "c3",
      edge: "start",
      toUs: 4_950_000,
      ripple: false,
    });
    expect(r).toEqual({
      op: { type: "trimClip", clipId: "c3", edge: "start", toUs: 5 * SEC },
      snappedTo: 5 * SEC,
    });
  });

  it("uses rippleTrim for the ripple tool, and frame-rounds when not snapped", () => {
    const p = project();
    const r = trimGesture(env(p, { snapping: false }), {
      clipId: "c3",
      edge: "end",
      toUs: 7_520_000,
      ripple: true,
    });
    expect(r?.op).toEqual({ type: "rippleTrim", clipId: "c3", edge: "end", toUs: 7_533_333 });
    expect(r?.snappedTo).toBeNull();
  });

  it("returns null when the edge doesn't move", () => {
    const p = project();
    expect(
      trimGesture(env(p, { snapping: false }), {
        clipId: "c1",
        edge: "start",
        toUs: 0,
        ripple: false,
      }),
    ).toBeNull();
    expect(trimGesture(env(p), { clipId: "zz", edge: "start", toUs: 0, ripple: false })).toBeNull();
  });

  it("the committed trim really changes the clip; refused ones preview as errors", () => {
    const p = project();
    const ok = trimGesture(env(p, { snapping: false }), {
      clipId: "c3",
      edge: "end",
      toUs: 7 * SEC,
      ripple: false,
    });
    expect(
      commit(p, must(ok).op).compositions[0]?.tracks[0]?.clips.find((c) => c.id === "c3")?.outUs,
    ).toBe(5 * SEC);
    const bad = trimGesture(env(p, { snapping: false }), {
      clipId: "c1",
      edge: "end",
      toUs: 3 * SEC,
      ripple: false,
    });
    expect(previewGesture(p, must(bad).op)).toMatchObject({
      project: null,
      error: { code: "clips_overlap" },
    });
  });
});

describe("trimGesture and linked clips", () => {
  it("trims the linked partner by the same amount, in one op", () => {
    const p = project();
    const r = trimGesture(env(p, { snapping: false }), {
      clipId: "c1",
      edge: "end",
      toUs: 1_500_000,
      ripple: false,
      selectedIds: ["c1", "a1"],
    });
    expect(r?.op).toEqual({
      type: "batch",
      label: "Trim clips",
      ops: [
        { type: "trimClip", clipId: "c1", edge: "end", toUs: 1_500_000 },
        { type: "trimClip", clipId: "a1", edge: "end", toUs: 1_500_000 },
      ],
    });
    const after = commit(p, must(r).op);
    const outs = after.compositions[0]?.tracks
      .flatMap((t) => t.clips)
      .filter((c) => c.linkId === "L");
    expect(outs?.map((c) => c.outUs)).toEqual([1_500_000, 1_500_000]);
  });

  it("moves the partner by the same distance even when its edge isn't where the grabbed one is", () => {
    const p = applyOp(project(), {
      type: "trimClip",
      clipId: "a1",
      edge: "end",
      toUs: 1 * SEC,
    }).project;
    const r = trimGesture(env(p, { snapping: false }), {
      clipId: "c1",
      edge: "end",
      toUs: 1_500_000,
      ripple: false,
      selectedIds: ["c1", "a1"],
    });
    // c1 ends at 2 s and goes to 1.5 s (-0.5 s); a1 ends at 1 s and goes to 0.5 s
    expect(r?.op).toMatchObject({ ops: [{ toUs: 1_500_000 }, { clipId: "a1", toUs: 500_000 }] });
  });

  it("leaves the partner alone when it isn't in the selection (Alt-click), or isn't linked", () => {
    const p = project();
    const solo = trimGesture(env(p, { snapping: false }), {
      clipId: "c1",
      edge: "end",
      toUs: 1_500_000,
      ripple: false,
      selectedIds: ["c1"],
    });
    expect(solo?.op).toEqual({ type: "trimClip", clipId: "c1", edge: "end", toUs: 1_500_000 });
    const unrelated = trimGesture(env(p, { snapping: false }), {
      clipId: "c3",
      edge: "end",
      toUs: 7 * SEC,
      ripple: false,
      selectedIds: ["c3", "c2"],
    });
    expect(unrelated?.op).toMatchObject({ type: "trimClip", clipId: "c3" });
  });

  it("ripple trims the partner too", () => {
    const p = project();
    const r = trimGesture(env(p, { snapping: false }), {
      clipId: "c1",
      edge: "end",
      toUs: 1_500_000,
      ripple: true,
      selectedIds: ["c1", "a1"],
    });
    expect(r?.op).toMatchObject({
      ops: [{ type: "rippleTrim" }, { type: "rippleTrim", clipId: "a1" }],
    });
  });
});

describe("rollGesture", () => {
  it("moves the cut between adjacent clips", () => {
    const p = project();
    const r = rollGesture(env(p, { snapping: false }), {
      leftClipId: "c1",
      rightClipId: "c2",
      toUs: 1_500_000,
    });
    expect(r?.op).toEqual({
      type: "rollEdit",
      leftClipId: "c1",
      rightClipId: "c2",
      toUs: 1_500_000,
    });
    expect(
      commit(p, must(r).op).compositions[0]?.tracks[0]?.clips.map((c) => [c.id, c.startUs]),
    ).toEqual([
      ["c1", 0],
      ["c2", 1_500_000],
      ["c3", 6 * SEC],
    ]);
  });

  it("returns null when the cut stays, and non-adjacent clips preview as an error", () => {
    const p = project();
    expect(
      rollGesture(env(p, { snapping: false }), {
        leftClipId: "c1",
        rightClipId: "c2",
        toUs: 2 * SEC,
      }),
    ).toBeNull();
    const far = rollGesture(env(p, { snapping: false }), {
      leftClipId: "c2",
      rightClipId: "c3",
      toUs: 5 * SEC,
    });
    expect(previewGesture(p, must(far).op)).toMatchObject({ error: { code: "not_adjacent" } });
  });
});

describe("slipGesture and slideGesture", () => {
  it("slip moves the source window against the drag, scaled by speed; reversed flips it", () => {
    const p = project();
    expect(slipGesture(env(p), { clipId: "c2", deltaUs: 500_000 })?.op).toEqual({
      type: "slipClip",
      clipId: "c2",
      deltaUs: -500_000,
    });
    const fast = applyOp(p, {
      type: "setProps",
      clipId: "c2",
      props: { speed: 2, outUs: 6 * SEC },
    }).project;
    expect(slipGesture(env(fast), { clipId: "c2", deltaUs: 500_000 })?.op).toMatchObject({
      deltaUs: -1_000_000,
    });
    const rev = applyOp(p, { type: "setProps", clipId: "c2", props: { reversed: true } }).project;
    expect(slipGesture(env(rev), { clipId: "c2", deltaUs: 500_000 })?.op).toMatchObject({
      deltaUs: 500_000,
    });
    expect(slipGesture(env(p), { clipId: "c2", deltaUs: 0 })).toBeNull();
  });

  it("slide moves the clip, keeping neighbours adjacent", () => {
    const p = project();
    const r = slideGesture(env(p, { snapping: false }), { clipId: "c2", deltaUs: 500_000 });
    expect(r?.op).toEqual({ type: "slideClip", clipId: "c2", deltaUs: 500_000 });
    const after = commit(p, must(r).op).compositions[0]?.tracks[0]?.clips;
    expect(after?.map((c) => [c.id, c.startUs])).toEqual([
      ["c1", 0],
      ["c2", 2_500_000],
      ["c3", 6 * SEC],
    ]);
    expect(slideGesture(env(p, { snapping: false }), { clipId: "c2", deltaUs: 5_000 })).toBeNull();
  });
});

describe("razorGesture", () => {
  it("cuts the clicked clip and its linked partner and relinks the new halves", () => {
    const p = project();
    const r = razorGesture(env(p, { snapping: false }), { clipId: "c1", atUs: SEC });
    expect(r?.op).toMatchObject({ type: "batch", label: "Split clips" });
    const after = commit(p, must(r).op);
    const clips = after.compositions[0]?.tracks.flatMap((t) => t.clips) ?? [];
    expect(clips.filter((c) => c.startUs === SEC && c.id.startsWith("n")).length).toBe(2);
    const halves = clips.filter((c) => c.id.startsWith("n") && c.linkId !== undefined);
    expect(new Set(halves.map((c) => c.linkId)).size).toBe(1);
  });

  it("snaps to the playhead, and returns null on an edge, a gap or a locked track", () => {
    const p = project();
    const r = razorGesture(env(p, {}, ["c3"]), { clipId: "c3", atUs: 5 * SEC + 1 });
    expect(r).toBeNull(); // 5 s is outside c3 [6,8): snapped time still not inside
    const inside = razorGesture(env(p, { snapPoints: [7 * SEC] }), {
      clipId: "c3",
      atUs: 7 * SEC - 20_000,
    });
    expect(inside?.snappedTo).toBe(7 * SEC);
    expect(razorGesture(env(p, { snapping: false }), { clipId: "c2", atUs: 2 * SEC })).toBeNull();
    const locked = applyOp(p, {
      type: "setTrackProps",
      trackId: "V1",
      props: { locked: true },
    }).project;
    expect(
      razorGesture(env(locked, { snapping: false }), { clipId: "c2", atUs: 3 * SEC }),
    ).toBeNull();
  });
});

describe("snapExclusions", () => {
  it("leaves out the dragged clips (the whole linked selection for a move)", () => {
    const comp = must(project().compositions[0]);
    expect(snapExclusions(comp, "move", "c2", []).sort()).toEqual(["c2"]);
    expect(snapExclusions(comp, "move", "c1", []).sort()).toEqual(["a1", "c1"]);
    expect(snapExclusions(comp, "trim", "c1", ["c3"])).toEqual(["c1"]);
  });
});

describe("previewGesture", () => {
  it("returns the project after the op, or the reason it is refused, never throwing for an OpError", () => {
    const p = project();
    const ok = previewGesture(p, { type: "setProps", clipId: "c1", props: { opacity: 0.5 } });
    expect(ok.error).toBeNull();
    const bad = previewGesture(p, { type: "removeClip", clipId: "nope" });
    expect(bad).toMatchObject({ project: null, error: { code: "unknown_clip" } });
  });
});
