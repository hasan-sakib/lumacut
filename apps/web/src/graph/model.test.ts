import { createClip, type Keyframe } from "@lumacut/schema";
import { describe, expect, it } from "vitest";
import {
  channelValues,
  curvesOf,
  easeFromInto,
  easeFromOut,
  labelOfPath,
  makePlot,
  movedKeyframe,
  paddedRange,
  sampleChannels,
  segmentHandles,
} from "./model.ts";

const SEC = 1_000_000;
const bez = (tUs: number, value: number, extra: Partial<Keyframe> = {}): Keyframe => ({
  tUs,
  value,
  interpolation: "bezier",
  ...extra,
});

describe("plot", () => {
  it("maps time and value to pixels and back", () => {
    const plot = makePlot(600, 200, 2 * SEC, [-1, 3]);
    for (const t of [0, 0.5 * SEC, 2 * SEC]) expect(plot.tAt(plot.x(t))).toBeCloseTo(t, 6);
    for (const v of [-1, 0, 2.5]) expect(plot.valueAt(plot.y(v))).toBeCloseTo(v, 9);
    expect(plot.y(3)).toBeLessThan(plot.y(-1)); // bigger values are higher on screen
  });

  it("pads the range and never returns an empty one", () => {
    const [low, high] = paddedRange([0, 10]);
    expect(low).toBeLessThan(0);
    expect(high).toBeGreaterThan(10);
    const [a, b] = paddedRange([5, 5]);
    expect(b - a).toBeGreaterThan(0);
    expect(paddedRange([])).toEqual([0, 1]);
  });
});

describe("handles", () => {
  const k0 = bez(0, 2, { easeOut: { influence: 40, speed: 5 } });
  const k1 = bez(2 * SEC, 10, { easeIn: { influence: 25, speed: -1 } });

  it("value graph: the handle's slope is the ease speed", () => {
    const { out, into } = segmentHandles(k0, k1, "value");
    expect(out.tUs).toBeCloseTo(0.8 * SEC, 6);
    expect((out.y - 2) / (out.tUs / SEC)).toBeCloseTo(5, 9);
    expect(into.tUs).toBeCloseTo(1.5 * SEC, 6);
    expect((10 - into.y) / ((2 * SEC - into.tUs) / SEC)).toBeCloseTo(-1, 9);
  });

  it("speed graph: the handle sits at (influence, speed)", () => {
    const { out, into } = segmentHandles(k0, k1, "speed");
    expect(out).toEqual({ tUs: 0.8 * SEC, y: 5 });
    expect(into).toEqual({ tUs: 1.5 * SEC, y: -1 });
  });

  it("dragging a handle to where it already is changes nothing (both graphs)", () => {
    for (const mode of ["value", "speed"] as const) {
      const { out, into } = segmentHandles(k0, k1, mode);
      const a = easeFromOut(k0, k1, mode, out.tUs, out.y);
      expect(a.influence).toBeCloseTo(40, 9);
      expect(a.speed).toBeCloseTo(5, 9);
      const b = easeFromInto(k0, k1, mode, into.tUs, into.y);
      expect(b.influence).toBeCloseTo(25, 9);
      expect(b.speed).toBeCloseTo(-1, 9);
    }
  });

  it("clamps influence to its allowed range", () => {
    expect(easeFromOut(k0, k1, "speed", -5 * SEC, 0).influence).toBe(0.1);
    expect(easeFromOut(k0, k1, "speed", 9 * SEC, 0).influence).toBe(100);
  });

  it("unset eases show the defaults: a third of the way at the average speed", () => {
    const { out } = segmentHandles(bez(0, 0), bez(SEC, 6), "speed");
    expect(out.tUs).toBeCloseTo(SEC / 3, 6);
    expect(out.y).toBeCloseTo(6, 9);
  });
});

describe("moving a keyframe", () => {
  const frames = [bez(0, 0), bez(SEC, 1), bez(2 * SEC, 0)];

  it("changes time and value", () => {
    expect(movedKeyframe(frames, 1, 2 * SEC, 1.2 * SEC, 5)).toMatchObject({
      tUs: 1.2 * SEC,
      value: 5,
    });
  });

  it("stays strictly between its neighbours and inside the clip", () => {
    expect(movedKeyframe(frames, 1, 2 * SEC, 5 * SEC, undefined)?.tUs).toBe(2 * SEC - 1);
    expect(movedKeyframe(frames, 1, 2 * SEC, -5, undefined)?.tUs).toBe(1);
    expect(movedKeyframe(frames, 2, 2 * SEC, 9 * SEC, undefined)?.tUs).toBe(2 * SEC);
  });

  it("keeps the value of points and colours (only time moves)", () => {
    const pts: Keyframe[] = [
      { tUs: 0, value: [1, 2], interpolation: "linear" },
      { tUs: SEC, value: [3, 4], interpolation: "linear" },
    ];
    expect(movedKeyframe(pts, 1, 2 * SEC, 1.5 * SEC, 99)?.value).toEqual([3, 4]);
    expect(movedKeyframe(pts, 5, 2 * SEC, 1, 1)).toBeNull();
  });
});

describe("curves", () => {
  it("lists animated properties with names and skips empty tracks", () => {
    const clip = createClip({
      id: "c",
      type: "solid",
      keyframes: {
        opacity: [bez(0, 0), bez(SEC, 1)],
        "transform.position": [{ tUs: 0, value: [0, 0], interpolation: "linear" }],
        "transform.rotation": [],
      },
    });
    expect(curvesOf(clip).map((c) => [c.path, c.label, c.kind])).toEqual([
      ["opacity", "Opacity", "number"],
      ["transform.position", "Position", "vec2"],
    ]);
    expect(labelOfPath("transform.scale")).toBe("Scale");
    expect(labelOfPath("effects.a.params.radius")).toBe("effects.a.params.radius");
  });

  it("splits values into the numbers that get drawn", () => {
    expect(channelValues(0.5)).toEqual([0.5]);
    expect(channelValues([1, 2])).toEqual([1, 2]);
    expect(channelValues({ r: 1, g: 0.5, b: 0, a: 1 })).toEqual([1, 0.5, 0, 1]);
  });

  it("samples a curve from the start to the end of the clip", () => {
    const samples = sampleChannels([bez(0, 0), bez(SEC, 10)], 2 * SEC, 4);
    expect(samples.map((s) => s.tUs)).toEqual([0, 0.5 * SEC, SEC, 1.5 * SEC, 2 * SEC]);
    expect(samples[0]?.values).toEqual([0]);
    expect(samples[2]?.values[0]).toBeCloseTo(10, 9);
    expect(samples[4]?.values[0]).toBe(10); // holds the last value
  });
});
