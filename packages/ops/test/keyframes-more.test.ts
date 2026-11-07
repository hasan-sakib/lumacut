import { createClip, type Clip, type Keyframe, type KeyframeValue } from "@lumacut/schema";
import { describe, expect, it } from "vitest";
import {
  animatedClip,
  evaluate,
  evaluateFrames,
  isAnimated,
  kindOf,
  localTime,
  resolveProperty,
  splitFrames,
  valueFitsKind,
  applyOp,
} from "../src/index.ts";
import { cubic, solveForX } from "../src/keyframes/bezier.ts";
import { SEC, getClip, sampleProject } from "./helpers.ts";

const lin = (tUs: number, value: KeyframeValue): Keyframe => ({
  tUs,
  value,
  interpolation: "linear",
});

const full = (): Clip =>
  createClip({
    id: "k",
    type: "media",
    audio: { volume: 1, pan: 0, fadeInUs: 0, fadeOutUs: 0, effects: [] },
    effects: [
      {
        id: "fx",
        effectId: "x",
        enabled: true,
        params: {
          radius: 2,
          center: [1, 2],
          tint: { r: 1, g: 0, b: 0, a: 1 },
          on: true,
          name: "n",
        },
      },
    ],
  });

describe("every animatable property reads and writes its own field", () => {
  const cases: [string, KeyframeValue][] = [
    ["transform.x", 11],
    ["transform.y", 12],
    ["transform.scaleX", 1.5],
    ["transform.scaleY", 1.6],
    ["transform.rotation", 45],
    ["transform.anchorX", 3],
    ["transform.anchorY", 4],
    ["transform.skew", 5],
    ["transform.position", [7, 8]],
    ["transform.scale", [2, 3]],
    ["transform.anchor", [9, 10]],
    ["opacity", 0.3],
    ["crop.left", 0.1],
    ["crop.top", 0.2],
    ["crop.right", 0.3],
    ["crop.bottom", 0.4],
    ["color.exposure", 1],
    ["color.contrast", 0.5],
    ["color.highlights", -0.5],
    ["color.shadows", 0.25],
    ["color.whites", 0.1],
    ["color.blacks", -0.1],
    ["color.temperature", 20],
    ["color.tint", -10],
    ["color.saturation", 0.4],
    ["color.vibrance", 0.6],
    ["color.lift.r", 0.1],
    ["color.gamma.g", 0.2],
    ["color.gain.b", 0.3],
    ["color.offset.r", 0.4],
    ["audio.volume", 2],
    ["audio.pan", -0.5],
    ["effects.fx.params.radius", 9],
    ["effects.fx.params.center", [5, 6]],
    ["effects.fx.params.tint", { r: 0, g: 1, b: 0, a: 0.5 }],
  ];

  it.each(cases)("%s", (path, value) => {
    const clip = full();
    const property = resolveProperty(clip, path);
    expect(property, path).toBeDefined();
    if (property === undefined) return;
    expect(valueFitsKind(value, property.kind)).toBe(true);
    const written = property.set(clip, value);
    expect(property.get(written)).toEqual(value);
    expect(clip).toEqual(full()); // the input is not changed
    // And only this property changed: writing the original value back restores the clip.
    expect(property.set(written, property.get(clip))).toEqual(clip);
  });

  it("rejects what is not animatable", () => {
    const clip = full();
    for (const path of [
      "effects.fx.params.on",
      "effects.fx.params.name",
      "color.lift",
      "color.lift.x",
      "crop.middle",
      "audio.fade",
    ]) {
      expect(resolveProperty(clip, path), path).toBeUndefined();
    }
    expect(valueFitsKind(1, "vec2")).toBe(false);
  });

  it("an effect parameter that is removed after being resolved reads as its old value and writes nothing", () => {
    const clip = full();
    const property = resolveProperty(clip, "effects.fx.params.radius");
    const bare = { ...clip, effects: [] };
    expect(property?.get(bare)).toBe(2);
    expect(property?.set(bare, 5)).toEqual(bare);
    // A shape can't be written into an effect parameter.
    const path = { closed: true, vertices: [] };
    expect(property?.set(clip, path)).toEqual(clip);
  });
});

describe("evaluate helpers", () => {
  it("localTime, isAnimated, kindOf", () => {
    const clip = createClip({ id: "c", type: "solid", startUs: 5 * SEC });
    expect(localTime(clip, 7 * SEC)).toBe(2 * SEC);
    expect(isAnimated(clip)).toBe(false);
    expect(isAnimated({ ...clip, keyframes: { opacity: [lin(0, 1)] } })).toBe(true);
    expect(isAnimated({ ...clip, keyframes: { opacity: [] } })).toBe(false);
    expect(kindOf(1)).toBe("number");
    expect(kindOf([1, 2])).toBe("vec2");
    expect(kindOf({ r: 0, g: 0, b: 0, a: 1 })).toBe("color");
    expect(kindOf({ closed: false, vertices: [] })).toBe("path");
  });

  it("evaluate falls back to the static value when the keyframes are empty", () => {
    const clip = createClip({ id: "c", type: "solid", opacity: 0.7, keyframes: { opacity: [] } });
    expect(evaluate(clip, "opacity", 0)).toBe(0.7);
    expect(animatedClip(clip, 0)).toEqual(clip);
  });

  it("animated colours and vectors are written back onto the clip", () => {
    const clip = full();
    const animated = animatedClip(
      {
        ...clip,
        keyframes: {
          "effects.fx.params.tint": [
            lin(0, { r: 1, g: 0, b: 0, a: 1 }),
            lin(SEC, { r: 0, g: 0, b: 1, a: 1 }),
          ],
          "transform.scale": [lin(0, [1, 1]), lin(SEC, [3, 5])],
        },
      },
      SEC,
    );
    expect(animated.effects[0]?.params.tint).toMatchObject({ r: 0, b: 1 });
    expect(animated.transform).toMatchObject({ scaleX: 3, scaleY: 5 });
  });
});

describe("curve maths edge cases", () => {
  it("solveForX converges even when the curve is flat at the start", () => {
    for (const x of [0.001, 0.2, 0.9]) {
      const u = solveForX(0, 0, 0, 1, x);
      expect(cubic(0, 0, 0, 1, u)).toBeCloseTo(x, 9);
    }
    expect(solveForX(0, 0.3, 0.6, 1, -1)).toBe(0);
    expect(solveForX(0, 0.3, 0.6, 1, 2)).toBe(1);
  });

  it("shapes with a different vertex count switch at the end of the segment", () => {
    const vertex: {
      point: [number, number];
      inTangent: [number, number];
      outTangent: [number, number];
    } = {
      point: [0, 0],
      inTangent: [0, 0],
      outTangent: [0, 0],
    };
    const one: KeyframeValue = { closed: true, vertices: [vertex] };
    const two: KeyframeValue = { closed: true, vertices: [vertex, vertex] };
    const frames = [lin(0, one), lin(SEC, two)];
    expect(evaluateFrames(frames, 0.5 * SEC)).toEqual(one);
    expect(evaluateFrames(frames, SEC)).toEqual(two);
  });

  it("values of different kinds hold the first until the second arrives", () => {
    const frames = [lin(0, 1), lin(SEC, [2, 3])];
    expect(evaluateFrames(frames, 0.5 * SEC)).toBe(1);
    expect(evaluateFrames(frames, SEC)).toEqual([2, 3]);
  });
});

describe("splitFrames edge cases", () => {
  it("a hold segment stays held on both sides", () => {
    const frames: Keyframe[] = [{ tUs: 0, value: 4, interpolation: "hold" }, lin(SEC, 9)];
    const { head, tail } = splitFrames(frames, 0.5 * SEC);
    expect(evaluateFrames(head, 0.4 * SEC)).toBe(4);
    expect(evaluateFrames(tail, 0.3 * SEC)).toBe(4);
    expect(evaluateFrames(tail, 0.5 * SEC)).toBe(9);
  });

  it("a bezier segment between equal values splits into two linear halves", () => {
    const frames: Keyframe[] = [
      { tUs: 0, value: 5, interpolation: "bezier", easeOut: { influence: 70, speed: 3 } },
      { tUs: SEC, value: 5, interpolation: "bezier" },
    ];
    const { head, tail } = splitFrames(frames, 0.25 * SEC);
    expect(head.map((k) => k.value)).toEqual([5, 5]);
    expect(tail.map((k) => k.tUs)).toEqual([0, 0.75 * SEC]);
  });

  it("a cut before the first or after the last keyframe leaves everything on one side", () => {
    const frames = [lin(SEC, 1), lin(2 * SEC, 3)];
    expect(splitFrames(frames, 0.5 * SEC).head).toEqual([]);
    expect(splitFrames(frames, 0.5 * SEC).tail.map((k) => k.tUs)).toEqual([0.5 * SEC, 1.5 * SEC]);
    expect(splitFrames(frames, 5 * SEC).tail).toEqual([]);
    expect(splitFrames([], SEC)).toEqual({ head: [], tail: [] });
  });
});

describe("splitClip writes constants into the half left without keyframes", () => {
  it("the second half keeps the last value when the animation ended before the cut", () => {
    let p = sampleProject();
    p = applyOp(p, {
      type: "setProps",
      clipId: "c2",
      props: {
        opacity: 1,
        keyframes: { opacity: [lin(0, 0.2), lin(0.5 * SEC, 0.8)] },
      },
    }).project;
    // c2 starts at 2 s; cut at 3.5 s = 1.5 s into the clip, after the last keyframe (0.5 s).
    const out = applyOp(p, {
      type: "splitClip",
      clipId: "c2",
      atUs: 3.5 * SEC,
      newClipId: "c2b",
    }).project;
    const tail = getClip(out, "c2b");
    expect(tail.keyframes.opacity).toBeUndefined();
    expect(tail.opacity).toBe(0.8);
    expect(getClip(out, "c2").keyframes.opacity).toHaveLength(2);
  });

  it("an animated property that no longer resolves is dropped from the halves' constants", () => {
    let p = sampleProject();
    p = applyOp(p, {
      type: "setProps",
      clipId: "c2",
      props: { keyframes: { "effects.gone.params.r": [lin(0, 1), lin(SEC, 2)] } },
    }).project;
    const out = applyOp(p, {
      type: "splitClip",
      clipId: "c2",
      atUs: 3 * SEC,
      newClipId: "c2b",
    }).project;
    expect(getClip(out, "c2").keyframes["effects.gone.params.r"]?.length).toBeGreaterThan(0);
  });
});

describe("splitting eased and curved segments in unusual configurations", () => {
  const same = (frames: Keyframe[], cut: number): void => {
    const { head, tail } = splitFrames(frames, cut);
    for (let i = 0; i <= 50; i++) {
      const t = Math.round(((frames[frames.length - 1]?.tUs ?? 0) * i) / 50);
      const original = evaluateFrames(frames, t);
      const half = t < cut ? evaluateFrames(head, t) : evaluateFrames(tail, t - cut);
      expect(JSON.stringify(half).length > 0).toBe(true);
      const flat = (v: KeyframeValue | undefined): number[] =>
        typeof v === "number" ? [v] : Array.isArray(v) ? v : [];
      flat(original).forEach((n, k) => {
        expect(Math.abs(n - (flat(half)[k] ?? NaN))).toBeLessThan(0.05);
      });
    }
  };

  it("zero influence at either end", () => {
    same(
      [
        { tUs: 0, value: 0, interpolation: "bezier", easeOut: { influence: 0, speed: 0 } },
        { tUs: SEC, value: 10, interpolation: "bezier", easeIn: { influence: 0, speed: 0 } },
      ],
      0.4 * SEC,
    );
  });

  it("a spatial path where only the first or only the second keyframe has tangents", () => {
    const base = (spatial: Keyframe["spatialTangents"], which: 0 | 1): Keyframe[] => {
      const a: Keyframe = { tUs: 0, value: [0, 0], interpolation: "bezier" };
      const b: Keyframe = { tUs: SEC, value: [100, 0], interpolation: "bezier" };
      if (spatial !== undefined) (which === 0 ? a : b).spatialTangents = spatial;
      return [a, b];
    };
    same(base({ in: [0, 0], out: [20, 40] }, 0), 0.5 * SEC);
    same(base({ in: [-20, 40], out: [0, 0] }, 1), 0.5 * SEC);
  });

  it("a segment with a bezier head and linear tail keeps both", () => {
    same(
      [
        { tUs: 0, value: 0, interpolation: "bezier", easeOut: { influence: 90, speed: 2 } },
        { tUs: SEC, value: 4, interpolation: "linear" },
        { tUs: 2 * SEC, value: 0, interpolation: "linear" },
      ],
      1.5 * SEC,
    );
  });
});

describe("splitClip with animation on a property that can't be resolved", () => {
  it("keeps its keyframes on the side they belong to and doesn't invent a constant", () => {
    let p = sampleProject();
    p = applyOp(p, {
      type: "setProps",
      clipId: "c2",
      props: { keyframes: { "effects.gone.params.r": [lin(1.5 * SEC, 1), lin(1.8 * SEC, 2)] } },
    }).project;
    // Cut at 1 s into the clip: every keyframe is after it, so the first half has none.
    const out = applyOp(p, {
      type: "splitClip",
      clipId: "c2",
      atUs: 3 * SEC,
      newClipId: "c2b",
    }).project;
    expect(getClip(out, "c2").keyframes["effects.gone.params.r"]).toBeUndefined();
    expect(getClip(out, "c2b").keyframes["effects.gone.params.r"]).toHaveLength(2);
  });

  it("two identical points between keyframes stay put", () => {
    const frames = [lin(0, [4, 4]), lin(SEC, [4, 4])];
    expect(evaluateFrames(frames, 0.5 * SEC)).toEqual([4, 4]);
    const { head, tail } = splitFrames(frames, 0.5 * SEC);
    expect(evaluateFrames(head, 0.25 * SEC)).toEqual([4, 4]);
    expect(evaluateFrames(tail, 0.1 * SEC)).toEqual([4, 4]);
  });
});
