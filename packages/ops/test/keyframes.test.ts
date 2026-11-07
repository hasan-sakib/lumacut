import { createClip, type Clip, type Keyframe, type KeyframeValue } from "@lumacut/schema";
import { describe, expect, it } from "vitest";
import {
  animatedClip,
  applyOp,
  evaluate,
  evaluateFrames,
  resolveProperty,
  segmentInfo,
  speedProfile,
  splitFrames,
} from "../src/index.ts";
import { SEC, errorCode, getClip, sampleProject } from "./helpers.ts";

const lin = (tUs: number, value: KeyframeValue): Keyframe => ({
  tUs,
  value,
  interpolation: "linear",
});
const bez = (tUs: number, value: KeyframeValue, extra: Partial<Keyframe> = {}): Keyframe => ({
  tUs,
  value,
  interpolation: "bezier",
  ...extra,
});
const num = (v: KeyframeValue | undefined): number => {
  if (typeof v !== "number") throw new Error(`expected a number, got ${JSON.stringify(v)}`);
  return v;
};
const vec = (v: KeyframeValue | undefined): [number, number] => {
  if (!Array.isArray(v)) throw new Error(`expected a point, got ${JSON.stringify(v)}`);
  return [v[0], v[1]];
};
/** Influence 1/3 and speed 0 at both ends: "easy ease", which on [0,1]→[0,1] is 3t² − 2t³. */
const EASY = { influence: 100 / 3, speed: 0 };

describe("evaluateFrames", () => {
  it("is undefined without keyframes and constant with one", () => {
    expect(evaluateFrames([], 5)).toBeUndefined();
    expect(evaluateFrames([lin(SEC, 7)], 0)).toBe(7);
    expect(evaluateFrames([lin(SEC, 7)], 99 * SEC)).toBe(7);
  });

  it("holds the first value before and the last value after", () => {
    const frames = [lin(SEC, 2), lin(2 * SEC, 6)];
    expect(evaluateFrames(frames, 0)).toBe(2);
    expect(evaluateFrames(frames, 5 * SEC)).toBe(6);
    expect(evaluateFrames(frames, SEC)).toBe(2);
    expect(evaluateFrames(frames, 2 * SEC)).toBe(6);
  });

  it("interpolates linearly", () => {
    const frames = [lin(0, 0), lin(SEC, 10)];
    expect(num(evaluateFrames(frames, 0.25 * SEC))).toBeCloseTo(2.5, 12);
    expect(num(evaluateFrames(frames, 0.5 * SEC))).toBeCloseTo(5, 12);
  });

  it("holds until the next keyframe", () => {
    const frames: Keyframe[] = [{ tUs: 0, value: 1, interpolation: "hold" }, lin(SEC, 9)];
    expect(evaluateFrames(frames, 0.99 * SEC)).toBe(1);
    expect(evaluateFrames(frames, SEC)).toBe(9);
  });

  it("a bezier segment with no ease set is exactly linear", () => {
    const frames = [bez(0, 0), bez(2 * SEC, 8)];
    for (const f of [0.1, 0.3, 0.5, 0.77, 0.9]) {
      expect(num(evaluateFrames(frames, f * 2 * SEC))).toBeCloseTo(f * 8, 9);
    }
  });

  it("easy ease follows 3t² − 2t³ exactly", () => {
    const frames = [bez(0, 0, { easeOut: EASY }), bez(SEC, 1, { easeIn: EASY })];
    for (const t of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
      expect(num(evaluateFrames(frames, t * SEC))).toBeCloseTo(3 * t * t - 2 * t * t * t, 9);
    }
  });

  it("scales easing to the value change and the duration", () => {
    const frames = [bez(0, 10, { easeOut: EASY }), bez(4 * SEC, -30, { easeIn: EASY })];
    const t = 0.25;
    expect(num(evaluateFrames(frames, t * 4 * SEC))).toBeCloseTo(
      10 - 40 * (3 * t * t - 2 * t ** 3),
      9,
    );
  });

  it("a fast departure with high influence overshoots the target", () => {
    const frames = [
      bez(0, 0, { easeOut: { influence: 60, speed: 6 } }),
      bez(SEC, 1, { easeIn: { influence: 60, speed: -2 } }),
    ];
    const samples = Array.from({ length: 101 }, (_, i) =>
      num(evaluateFrames(frames, (i / 100) * SEC)),
    );
    expect(Math.max(...samples)).toBeGreaterThan(1.05);
    expect(num(evaluateFrames(frames, SEC))).toBe(1);
  });

  it("the speed at the start of a bezier segment matches the ease's speed", () => {
    const frames = [
      bez(0, 0, { easeOut: { influence: 50, speed: 3 } }),
      bez(SEC, 10, { easeIn: { influence: 50, speed: 0 } }),
    ];
    const h = 1e-4;
    const slope = (num(evaluateFrames(frames, h * SEC)) - 0) / h;
    expect(slope).toBeCloseTo(3, 1);
  });

  it("is monotone and bounded for an ease inside [0, value change]", () => {
    const frames = [bez(0, 0, { easeOut: EASY }), bez(SEC, 100, { easeIn: EASY })];
    let last = -1;
    for (let i = 0; i <= 200; i++) {
      const v = num(evaluateFrames(frames, (i / 200) * SEC));
      expect(v).toBeGreaterThanOrEqual(last);
      expect(v).toBeLessThanOrEqual(100);
      last = v;
    }
  });

  it("equal values stay put whatever the easing", () => {
    const frames = [bez(0, 5, { easeOut: { influence: 80, speed: 9 } }), bez(SEC, 5)];
    expect(evaluateFrames(frames, 0.5 * SEC)).toBe(5);
  });

  it("moves points along a straight line, eased by distance", () => {
    const frames = [lin(0, [0, 0]), lin(SEC, [100, 50])];
    const [x, y] = vec(evaluateFrames(frames, 0.5 * SEC));
    expect(x).toBeCloseTo(50, 9);
    expect(y).toBeCloseTo(25, 9);
  });

  it("follows a spatial bezier path with arc-length speed", () => {
    // An S-curve from (0,0) to (100,0): symmetric, so the middle lands at (50,0) at half time.
    const frames: Keyframe[] = [
      { ...lin(0, [0, 0]), spatialTangents: { in: [0, 0], out: [0, 60] } },
      { ...lin(SEC, [100, 0]), spatialTangents: { in: [0, -60], out: [0, 0] } },
    ];
    const [mx, my] = vec(evaluateFrames(frames, 0.5 * SEC));
    expect(mx).toBeCloseTo(50, 1);
    expect(my).toBeCloseTo(0, 1);
    // It bulges off the straight line at the quarter points.
    const [, qy] = vec(evaluateFrames(frames, 0.25 * SEC));
    expect(Math.abs(qy)).toBeGreaterThan(5);
    // Linear temporal ease: equal arc-length steps in equal time.
    const pts = [0, 0.25, 0.5, 0.75, 1].map((t) => vec(evaluateFrames(frames, t * SEC)));
    const steps = pts.slice(1).map((p, i) => {
      const q = pts[i] ?? [0, 0];
      return Math.hypot(p[0] - q[0], p[1] - q[1]);
    });
    for (const step of steps) expect(step).toBeGreaterThan((steps[0] ?? 0) * 0.9);
    expect(vec(evaluateFrames(frames, SEC))).toEqual([100, 0]);
  });

  it("blends colours in linear light", () => {
    const black = { r: 0, g: 0, b: 0, a: 1 };
    const white = { r: 1, g: 1, b: 1, a: 1 };
    const mid = evaluateFrames([lin(0, black), lin(SEC, white)], 0.5 * SEC);
    // 50% linear grey is 0.7354 in sRGB, not 0.5.
    expect(mid).toMatchObject({ a: 1 });
    const { r } = mid as { r: number };
    expect(r).toBeCloseTo(0.7354, 3);
  });

  it("morphs shapes vertex by vertex", () => {
    const path = (x: number): KeyframeValue => ({
      closed: true,
      vertices: [{ point: [x, 0], inTangent: [0, 0], outTangent: [0, 0] }],
    });
    const mid = evaluateFrames([lin(0, path(0)), lin(SEC, path(10))], 0.5 * SEC) as {
      vertices: { point: [number, number] }[];
    };
    expect(mid.vertices[0]?.point[0]).toBeCloseTo(5, 12);
  });
});

describe("property paths", () => {
  const clip = (extra: Partial<Clip> = {}): Clip =>
    createClip({ id: "k", type: "solid", startUs: 0, inUs: 0, outUs: SEC, ...extra });

  it("resolves the documented vocabulary and rejects the rest", () => {
    const c = clip({
      audio: { volume: 1, pan: 0, fadeInUs: 0, fadeOutUs: 0, effects: [] },
      effects: [
        {
          id: "fx1",
          effectId: "blur",
          enabled: true,
          params: { radius: 4, tint: [1, 2], flag: true },
        },
      ],
    });
    for (const path of [
      "opacity",
      "transform.x",
      "transform.position",
      "transform.scale",
      "transform.rotation",
      "crop.left",
      "color.exposure",
      "color.lift.g",
      "audio.volume",
      "effects.fx1.params.radius",
      "effects.fx1.params.tint",
    ]) {
      expect(resolveProperty(c, path), path).toBeDefined();
    }
    for (const path of [
      "transform",
      "transform.nope",
      "colour.exposure",
      "effects.missing.params.radius",
      "effects.fx1.params.flag",
      "effects.fx1.params.absent",
      "effects.fx1.radius",
      "opacity.x",
      "transform.x.y.z.w",
    ]) {
      expect(resolveProperty(c, path), path).toBeUndefined();
    }
  });

  it("audio properties need an audio block", () => {
    const { audio: _audio, ...bare } = clip();
    expect(resolveProperty(bare, "audio.volume")).toBeUndefined();
  });

  it("reads and writes pairs and wheels", () => {
    const c = clip();
    const position = resolveProperty(c, "transform.position");
    expect(position?.get(c)).toEqual([c.transform.x, c.transform.y]);
    const moved = position?.set(c, [11, 22]);
    expect(moved?.transform).toMatchObject({ x: 11, y: 22 });
    const lift = resolveProperty(c, "color.lift.b");
    expect(lift?.set(c, 0.3).color.lift).toEqual([0, 0, 0.3]);
  });

  it("evaluate returns the static value when not animated, the animation when it is", () => {
    const c = clip({ opacity: 0.5, keyframes: { opacity: [lin(0, 0), lin(SEC, 1)] } });
    expect(num(evaluate(c, "opacity", 0.25 * SEC))).toBeCloseTo(0.25, 12);
    expect(evaluate(c, "transform.x", 0)).toBe(c.transform.x);
    expect(evaluate(c, "nonsense", 0)).toBeUndefined();
  });

  it("animatedClip substitutes every animated property and ignores dead paths", () => {
    const c = clip({
      keyframes: {
        opacity: [lin(0, 0), lin(SEC, 1)],
        "transform.position": [lin(0, [0, 0]), lin(SEC, [100, 200])],
        "effects.gone.params.radius": [lin(0, 1), lin(SEC, 2)],
      },
    });
    const a = animatedClip(c, 0.5 * SEC);
    expect(a.opacity).toBeCloseTo(0.5, 12);
    expect(a.transform.x).toBeCloseTo(50, 9);
    expect(a.transform.y).toBeCloseTo(100, 9);
    expect(animatedClip(clip(), 0)).toEqual(clip());
  });
});

describe("addKeyframe validation", () => {
  const withKey = (path: string, value: KeyframeValue, clipId = "c1") =>
    applyOp(sampleProject(), {
      type: "addKeyframe",
      clipId,
      path,
      keyframe: lin(0, value),
    });

  it("accepts animatable paths with a value of the right kind", () => {
    expect(getClip(withKey("opacity", 0.5).project, "c1").keyframes.opacity).toHaveLength(1);
    withKey("transform.position", [1, 2]);
  });

  it("refuses unknown paths and values of the wrong kind", () => {
    expect(errorCode(() => withKey("transform.bogus", 1))).toBe("invalid_property");
    expect(errorCode(() => withKey("effects.nope.params.x", 1))).toBe("invalid_property");
    expect(errorCode(() => withKey("opacity", [1, 2]))).toBe("invalid_property");
    expect(errorCode(() => withKey("transform.position", 3))).toBe("invalid_property");
  });

  it("refuses to animate two properties that drive the same field", () => {
    const a = withKey("transform.x", 5).project;
    expect(
      errorCode(() =>
        applyOp(a, {
          type: "addKeyframe",
          clipId: "c1",
          path: "transform.position",
          keyframe: lin(0, [1, 1]),
        }),
      ),
    ).toBe("invalid_property");
    // y is independent of x.
    applyOp(a, { type: "addKeyframe", clipId: "c1", path: "transform.y", keyframe: lin(0, 1) });
  });

  it("removing an effect removes its keyframes", () => {
    let p = applyOp(sampleProject(), {
      type: "addEffect",
      clipId: "c1",
      effect: { id: "fx1", effectId: "blur", enabled: true, params: { radius: 3 } },
    }).project;
    p = applyOp(p, {
      type: "addKeyframe",
      clipId: "c1",
      path: "effects.fx1.params.radius",
      keyframe: lin(0, 3),
    }).project;
    const removed = applyOp(p, { type: "removeEffect", clipId: "c1", effectId: "fx1" });
    expect(getClip(removed.project, "c1").keyframes).toEqual({});
    expect(applyOp(removed.project, removed.inverse).project).toEqual(p);
  });
});

describe("splitting animation at a cut", () => {
  /** Original at time t equals the head at t (t < cut) or the tail at t − cut (t ≥ cut). */
  function expectContinuous(frames: Keyframe[], cut: number, tolerance: number): void {
    const { head, tail } = splitFrames(frames, cut);
    const last = frames[frames.length - 1]?.tUs ?? 0;
    for (let i = 0; i <= 120; i++) {
      const t = Math.round(((last * 1.1) / 120) * i);
      const original = evaluateFrames(frames, t);
      const half = t < cut ? evaluateFrames(head, t) : evaluateFrames(tail, t - cut);
      const a = original === undefined ? [] : flat(original);
      const b = half === undefined ? [] : flat(half);
      expect(b.length).toBe(a.length);
      a.forEach((v, k) => {
        expect(Math.abs(v - (b[k] ?? NaN)), `t=${String(t)}`).toBeLessThan(tolerance);
      });
    }
  }
  const flat = (v: KeyframeValue): number[] =>
    typeof v === "number" ? [v] : Array.isArray(v) ? v : "r" in v ? [v.r, v.g, v.b, v.a] : [];

  it("is seamless for linear and hold segments", () => {
    expectContinuous([lin(0, 0), lin(SEC, 10), lin(3 * SEC, -4)], 0.4 * SEC, 1e-9);
    expectContinuous([lin(0, 0), lin(SEC, 10), lin(3 * SEC, -4)], 2 * SEC, 1e-9);
    expectContinuous([{ tUs: 0, value: 1, interpolation: "hold" }, lin(SEC, 9)], 0.5 * SEC, 1e-9);
  });

  it("is seamless for eased bezier segments (the curve is split, not re-fitted)", () => {
    const frames = [
      bez(0, 0, { easeOut: { influence: 70, speed: 4 } }),
      bez(2 * SEC, 10, { easeIn: { influence: 20, speed: 12 } }),
      bez(3 * SEC, 2, { easeIn: EASY }),
    ];
    for (const cut of [0.3 * SEC, SEC, 1.9 * SEC, 2.5 * SEC]) expectContinuous(frames, cut, 1e-6);
  });

  it("is seamless for points on a spatial path", () => {
    const frames: Keyframe[] = [
      bez(0, [0, 0], {
        easeOut: { influence: 40, speed: 80 },
        spatialTangents: { in: [0, 0], out: [50, 80] },
      }),
      bez(2 * SEC, [200, 40], {
        easeIn: { influence: 60, speed: 30 },
        spatialTangents: { in: [-60, 40], out: [0, 0] },
      }),
    ];
    for (const cut of [0.5 * SEC, SEC, 1.7 * SEC]) expectContinuous(frames, cut, 0.05);
  });

  it("is seamless for colours", () => {
    const frames = [
      bez(0, { r: 1, g: 0, b: 0, a: 1 }, { easeOut: EASY }),
      bez(SEC, { r: 0, g: 0.5, b: 1, a: 0.5 }, { easeIn: EASY }),
    ];
    expectContinuous(frames, 0.35 * SEC, 1e-6);
  });

  it("keeps a keyframe that sits exactly on the cut in both halves", () => {
    const { head, tail } = splitFrames([lin(0, 0), lin(SEC, 5), lin(2 * SEC, 9)], SEC);
    expect(head.map((k) => k.tUs)).toEqual([0, SEC]);
    expect(tail.map((k) => k.tUs)).toEqual([0, SEC]);
    expect(tail[0]?.value).toBe(5);
  });
});

describe("segmentInfo and speedProfile (the graph editor's data)", () => {
  it("fills in the default ease: a third of the segment at the average speed", () => {
    const info = segmentInfo(bez(0, 0), bez(2 * SEC, 10));
    expect(info.length).toBe(10);
    expect(info.seconds).toBe(2);
    expect(info.easeOut.influence).toBeCloseTo(100 / 3, 9);
    expect(info.easeOut.speed).toBeCloseTo(5, 9);
    expect(info.easeIn.speed).toBeCloseTo(5, 9);
  });

  it("reports explicit eases as they are", () => {
    const info = segmentInfo(
      bez(0, 0, { easeOut: { influence: 80, speed: 3 } }),
      bez(SEC, 1, { easeIn: { influence: 10, speed: -1 } }),
    );
    expect(info.easeOut).toEqual({ influence: 80, speed: 3 });
    expect(info.easeIn).toEqual({ influence: 10, speed: -1 });
  });

  it("speed is constant for linear, zero for hold and starts and ends at the ease speed for bezier", () => {
    const linear = speedProfile([lin(0, 0), lin(SEC, 10)], 4);
    expect(linear.map((p) => p.speed)).toEqual([10, 10, 10, 10, 10]);
    const hold = speedProfile([{ tUs: 0, value: 0, interpolation: "hold" }, lin(SEC, 10)], 3);
    expect(hold.every((p) => p.speed === 0)).toBe(true);
    const eased = speedProfile(
      [
        bez(0, 0, { easeOut: { influence: 50, speed: 3 } }),
        bez(SEC, 10, { easeIn: { influence: 50, speed: 1 } }),
      ],
      40,
    );
    expect(eased[0]?.speed).toBeCloseTo(3, 1);
    expect(eased[eased.length - 1]?.speed).toBeCloseTo(1, 1);
  });

  it("the area under the speed curve is the distance travelled", () => {
    const frames = [bez(0, 0, { easeOut: EASY }), bez(SEC, 10, { easeIn: EASY })];
    const profile = speedProfile(frames, 400);
    let area = 0;
    profile.slice(1).forEach((p, i) => {
      const q = profile[i];
      if (q !== undefined) area += ((p.speed + q.speed) / 2) * ((p.tUs - q.tUs) / 1e6);
    });
    expect(area).toBeCloseTo(10, 2);
  });
});
