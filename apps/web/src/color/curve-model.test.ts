import { neutralColor } from "@lumacut/schema";
import { describe, expect, it } from "vitest";
import {
  addPoint,
  movePoint,
  neutralPoints,
  pointsOf,
  removePoint,
  withCurve,
} from "./curve-model.ts";

describe("curve points", () => {
  it("start as the identity line (tone curves) or the flat middle line (hue curves)", () => {
    expect(neutralPoints("master")).toEqual([
      [0, 0],
      [1, 1],
    ]);
    expect(neutralPoints("hueVsSat")).toEqual([
      [0, 0.5],
      [1, 0.5],
    ]);
    expect(pointsOf(neutralColor(), "g")).toEqual(neutralPoints("g"));
  });

  it("adds points in order, and moves one that is already there instead of doubling up", () => {
    const a = addPoint(neutralPoints("master"), 0.5, 0.7);
    expect(a.points).toEqual([
      [0, 0],
      [0.5, 0.7],
      [1, 1],
    ]);
    expect(a.index).toBe(1);
    const b = addPoint(a.points, 0.501, 0.2);
    expect(b.points).toHaveLength(3);
    expect(b.points[1]?.[1]).toBe(0.2);
    expect(addPoint(a.points, 2, -1).points.at(-1)).toEqual([1, 0]);
  });

  it("keeps a moved point between its neighbours; the ends only move up and down", () => {
    const pts = addPoint(addPoint(neutralPoints("master"), 0.3, 0.3).points, 0.6, 0.6).points;
    expect(movePoint(pts, 1, 0.9, 0.5)[1]?.[0]).toBeLessThan(0.6);
    expect(movePoint(pts, 1, -1, 0.5)[1]?.[0]).toBeGreaterThan(0);
    expect(movePoint(pts, 0, 0.5, 0.4)[0]).toEqual([0, 0.4]);
    expect(movePoint(pts, 3, 0.2, 2)[3]).toEqual([1, 1]);
    expect(movePoint(pts, 9, 0.5, 0.5)).toEqual(pts);
  });

  it("removes inner points only, and never goes below two", () => {
    const pts = addPoint(neutralPoints("master"), 0.5, 0.5).points;
    expect(removePoint(pts, 1)).toEqual(neutralPoints("master"));
    expect(removePoint(pts, 0)).toEqual(pts);
    expect(removePoint(pts, 2)).toEqual(pts);
    expect(removePoint(neutralPoints("master"), 1)).toEqual(neutralPoints("master"));
  });

  it("replaces one curve in the settings and keeps the rest", () => {
    const pts = addPoint(neutralPoints("r"), 0.5, 0.8).points;
    const color = withCurve(neutralColor(), "r", pts);
    expect(color.curves?.r).toEqual(pts);
    expect(color.curves?.master).toEqual(neutralPoints("master"));
    expect(color.curves?.hueVsSat).toBeUndefined();
    const more = withCurve(color, "hueVsSat", neutralPoints("hueVsSat"));
    expect(more.curves?.r).toEqual(pts);
    expect(withCurve(more, "g", pts).curves?.hueVsSat).toEqual(neutralPoints("hueVsSat"));
  });
});
