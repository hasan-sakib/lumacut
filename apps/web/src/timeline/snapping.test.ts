import { createClip, createComposition, createTrack } from "@lumacut/schema";
import { describe, expect, it } from "vitest";
import { snap, snapPoints, snapSpan } from "./snapping.ts";

const SEC = 1_000_000;
const clip = (id: string, start: number, len: number) =>
  createClip({ id, type: "media", assetId: "v", startUs: start * SEC, inUs: 0, outUs: len * SEC });

const comp = createComposition({
  id: "main",
  width: 10,
  height: 10,
  durationUs: 10 * SEC,
  tracks: [
    createTrack({ id: "V1", kind: "visual", clips: [clip("a", 1, 2), clip("b", 5, 1)] }),
    createTrack({ id: "V2", kind: "visual", clips: [clip("c", 3, 2)] }),
  ],
  markers: [{ id: "m", tUs: 8 * SEC, durationUs: 0, label: "", color: { r: 1, g: 0, b: 0, a: 1 } }],
});

describe("snapPoints", () => {
  it("collects 0, clip edges, markers and the playhead, sorted and unique", () => {
    expect(snapPoints(comp, { playheadUs: 3 * SEC })).toEqual(
      [0, 1, 3, 5, 6, 8].map((s) => s * SEC),
    );
  });

  it("leaves out excluded clips and can skip markers", () => {
    expect(snapPoints(comp, { excludeClipIds: ["a", "c"] })).toEqual(
      [0, 5, 6, 8].map((s) => s * SEC),
    );
    expect(snapPoints(comp, { includeMarkers: false })).toEqual(
      [0, 1, 3, 5, 6].map((s) => s * SEC),
    );
  });
});

describe("snap", () => {
  const points = [0, 1, 3, 5].map((s) => s * SEC);

  it("pulls to the nearest point within the threshold", () => {
    expect(snap(1.04 * SEC, points, 0.1 * SEC)).toEqual({ tUs: 1 * SEC, to: 1 * SEC });
    expect(snap(2.96 * SEC, points, 0.1 * SEC)).toEqual({ tUs: 3 * SEC, to: 3 * SEC });
  });

  it("leaves the time alone when nothing is close", () => {
    expect(snap(2 * SEC, points, 0.1 * SEC)).toEqual({ tUs: 2 * SEC, to: null });
    expect(snap(2 * SEC, [], SEC)).toEqual({ tUs: 2 * SEC, to: null });
  });

  it("picks the closer of two points", () => {
    expect(snap(2 * SEC, [1.9 * SEC, 2.2 * SEC], SEC).to).toBe(1.9 * SEC);
  });
});

describe("snapSpan", () => {
  const points = [0, 4, 9].map((s) => s * SEC);

  it("shifts so the closer edge lands on a point", () => {
    // span [3.95, 5.95): the start is 0.05 from 4, the end is 3.05 from 9
    expect(snapSpan(3_950_000, 5_950_000, points, 100_000)).toEqual({
      deltaUs: 50_000,
      to: 4 * SEC,
      edge: "start",
    });
    // span [6.95, 8.95): the end is 0.05 from 9
    const end = snapSpan(6_950_000, 8_950_000, points, 100_000);
    expect(end.edge).toBe("end");
    expect(end.to).toBe(9 * SEC);
    expect(end.deltaUs).toBe(50_000);
  });

  it("does nothing when neither edge is close", () => {
    expect(snapSpan(5 * SEC, 6 * SEC, points, 0.1 * SEC)).toEqual({
      deltaUs: 0,
      to: null,
      edge: null,
    });
  });

  it("when both edges could snap, the nearer one wins", () => {
    const r = snapSpan(3.9 * SEC, 8.95 * SEC, points, 0.2 * SEC);
    expect(r.edge).toBe("end");
  });
});
