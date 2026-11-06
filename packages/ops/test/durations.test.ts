import { createComposition, createProject } from "@lumacut/schema";
import { describe, expect, it } from "vitest";
import { applyOp, contentEndUs, durationOps } from "../src/index.ts";
import { SEC, sampleProject } from "./helpers.ts";

describe("durationOps", () => {
  it("measures the content: the end of the last clip on any track", () => {
    expect(contentEndUs(sampleProject(), "main")).toBe(6 * SEC); // c3 ends at 6 s
    expect(contentEndUs(sampleProject(), "nope")).toBe(0);
  });

  it("asks for an update only when the duration differs", () => {
    const p = sampleProject(); // durationUs is 10 s, content ends at 6 s
    expect(durationOps(p)).toEqual([{ type: "updateComposition", compositionId: "main", props: { durationUs: 6 * SEC } }]);
    const synced = applyOp(p, { type: "batch", ops: durationOps(p) }).project;
    expect(durationOps(synced)).toEqual([]);
  });

  it("follows edits in both directions and an empty composition is zero long", () => {
    const p = applyOp(sampleProject(), { type: "batch", ops: durationOps(sampleProject()) }).project;
    const longer = applyOp(p, { type: "moveClip", clipId: "c3", trackId: "V1", startUs: 8 * SEC }).project;
    expect(durationOps(longer)).toEqual([{ type: "updateComposition", compositionId: "main", props: { durationUs: 10 * SEC } }]);
    const empty = createProject({
      id: "e",
      now: "2026-11-06T00:00:00Z",
      compositions: [createComposition({ id: "main", width: 10, height: 10, durationUs: 5 * SEC })],
      mainCompositionId: "main",
    });
    expect(durationOps(empty)).toEqual([{ type: "updateComposition", compositionId: "main", props: { durationUs: 0 } }]);
  });

  it("leaves photo projects alone", () => {
    const photo = { ...sampleProject(), kind: "photo" as const };
    expect(durationOps(photo)).toEqual([]);
  });

  it("covers every composition, nested ones included", () => {
    const nested = applyOp(sampleProject(), {
      type: "precompose",
      compositionId: "main",
      clipIds: ["c1", "c2"],
      newCompositionId: "nest",
      newCompositionName: "Nest",
      newClipId: "nc",
    }).project;
    const ids = durationOps(nested).map((o) => (o.type === "updateComposition" ? o.compositionId : ""));
    expect(ids).toEqual(["main"]); // "nest" was created with exactly its content length
  });
});
