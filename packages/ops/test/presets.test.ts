import type { Keyframe, KeyframeValue } from "@lumacut/schema";
import { describe, expect, it } from "vitest";
import {
  EASE_PRESETS,
  applyEasePreset,
  applyOp,
  easePresetOps,
  evaluateFrames,
  keyframeOps,
} from "../src/index.ts";
import { SEC, getClip, sampleProject } from "./helpers.ts";

const lin = (tUs: number, value: KeyframeValue): Keyframe => ({
  tUs,
  value,
  interpolation: "linear",
});
const two = [lin(0, 0), lin(SEC, 1)];
const num = (v: KeyframeValue | undefined): number => {
  if (typeof v !== "number") throw new Error("expected a number");
  return v;
};
const samples = (frames: Keyframe[], n = 400): number[] =>
  Array.from({ length: n + 1 }, (_, i) => num(evaluateFrames(frames, (i / n) * SEC)));

describe("applyEasePreset", () => {
  it("never changes its input", () => {
    const before = structuredClone(two);
    for (const preset of EASE_PRESETS) applyEasePreset(two, 0, preset);
    expect(two).toEqual(before);
  });

  it("linear and hold only change the interpolation", () => {
    expect(applyEasePreset(two, 0, "hold")[0]?.interpolation).toBe("hold");
    const eased = applyEasePreset(two, 0, "easeInOut");
    expect(applyEasePreset(eased, 0, "linear")[0]?.interpolation).toBe("linear");
  });

  it("ease in and out is the smoothstep curve", () => {
    const frames = applyEasePreset(two, 0, "easeInOut");
    expect(frames).toHaveLength(2);
    for (const t of [0.1, 0.25, 0.5, 0.75]) {
      expect(num(evaluateFrames(frames, t * SEC))).toBeCloseTo(3 * t * t - 2 * t ** 3, 9);
    }
  });

  it("ease out slows the departure only; ease in slows the arrival only", () => {
    const out = samples(applyEasePreset(two, 0, "easeOut"));
    expect(out[4]).toBeLessThan(0.02); // slow at the start
    const into = samples(applyEasePreset(two, 1, "easeIn"));
    expect(1 - (into[396] ?? 0)).toBeLessThan(0.02); // slow at the end
    // Ease in needs a segment before it.
    expect(applyEasePreset(two, 0, "easeIn")).toEqual(two);
  });

  it("overshoot goes past the target and settles exactly on it", () => {
    const frames = applyEasePreset(two, 0, "overshoot");
    expect(frames.length).toBeGreaterThan(2);
    const s = samples(frames);
    expect(Math.max(...s)).toBeGreaterThan(1.05);
    expect(s[s.length - 1]).toBe(1);
    expect(s[0]).toBe(0);
  });

  it("bounce lands on the target and never goes past it", () => {
    const frames = applyEasePreset(two, 0, "bounce");
    const s = samples(frames);
    expect(Math.max(...s)).toBeLessThanOrEqual(1 + 1e-9);
    expect(num(evaluateFrames(frames, 0.5 * SEC))).toBeCloseTo(1, 9); // first landing
    expect(num(evaluateFrames(frames, 0.65 * SEC))).toBeLessThan(0.8); // bounced back up
    expect(s[s.length - 1]).toBe(1);
  });

  it("elastic swings around the target and settles on it", () => {
    const s = samples(applyEasePreset(two, 0, "elastic"));
    const crossings = s.slice(1).filter((v, i) => (v - 1) * ((s[i] ?? 0) - 1) < 0).length;
    expect(crossings).toBeGreaterThanOrEqual(3);
    expect(s[s.length - 1]).toBe(1);
  });

  it("works on points, and leaves colours alone (they can't overshoot)", () => {
    const pts = applyEasePreset([lin(0, [0, 0]), lin(SEC, [100, 50])], 0, "overshoot");
    expect(pts.length).toBeGreaterThan(2);
    const red = { r: 1, g: 0, b: 0, a: 1 };
    const blue = { r: 0, g: 0, b: 1, a: 1 };
    const colours = [lin(0, red), lin(SEC, blue)];
    expect(applyEasePreset(colours, 0, "bounce")).toEqual(colours);
  });

  it("does nothing when there's no next keyframe or no such keyframe", () => {
    expect(applyEasePreset(two, 1, "bounce")).toEqual(two);
    expect(applyEasePreset(two, 7, "overshoot")).toEqual(two);
  });

  it("a short segment skips beats that don't fit instead of colliding", () => {
    const tiny = [lin(0, 0), lin(3, 1)];
    const times = applyEasePreset(tiny, 0, "elastic").map((k) => k.tUs);
    expect(new Set(times).size).toBe(times.length);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });
});

describe("keyframeOps", () => {
  it("turns one set of keyframes into another through real ops", () => {
    let project = sampleProject();
    const before = [lin(0, 0), lin(SEC, 1)];
    project = applyOp(project, {
      type: "batch",
      ops: before.map((keyframe) => ({
        type: "addKeyframe" as const,
        clipId: "c1",
        path: "opacity",
        keyframe,
      })),
    }).project;
    const clip = getClip(project, "c1");
    const after = applyEasePreset(before, 0, "bounce");
    const ops = easePresetOps(clip, "opacity", 0, "bounce");
    const result = applyOp(project, { type: "batch", ops });
    expect(getClip(result.project, "c1").keyframes.opacity).toEqual(after);
    // And it undoes in one step.
    expect(applyOp(result.project, result.inverse).project).toEqual(project);
  });

  it("is empty when nothing changed, and removes keyframes that are gone", () => {
    expect(keyframeOps("c", "opacity", two, two)).toEqual([]);
    expect(keyframeOps("c", "opacity", two, two.slice(0, 1))).toEqual([
      { type: "removeKeyframe", clipId: "c", path: "opacity", tUs: SEC },
    ]);
  });
});
