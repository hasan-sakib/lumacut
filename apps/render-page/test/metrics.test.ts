import { describe, expect, it } from "vitest";
import {
  distribution,
  evaluateGates,
  frameCoverage,
  mulberry32,
  summarize,
  type PresentedFrame,
} from "../src/metrics.ts";

const fps30 = { num: 30, den: 1 };

describe("distribution", () => {
  it("reports mean, median, p95 and max; empty input is all zeros", () => {
    const d = distribution(Array.from({ length: 100 }, (_, i) => i + 1));
    expect(d).toEqual({ mean: 50.5, p50: 51, p95: 96, max: 100 });
    expect(distribution([])).toEqual({ mean: 0, p50: 0, p95: 0, max: 0 });
  });
});

describe("frameCoverage", () => {
  it("counts a frame shown twice (60 Hz display, 30 fps content) as shown once", () => {
    const times = [0, 16_000, 33_400, 50_000, 66_700];
    expect(frameCoverage(times, fps30)).toEqual({ shown: 3, expected: 3, droppedFraction: 0 });
  });

  it("counts skipped composition frames as dropped", () => {
    const times = [0, 33_400, 100_100, 133_400]; // frames 0,1,3,4: frame 2 never shown
    const c = frameCoverage(times, fps30);
    expect(c).toMatchObject({ shown: 4, expected: 5 });
    expect(c.droppedFraction).toBeCloseTo(0.2);
  });

  it("handles 29.97 frame boundaries", () => {
    const fps = { num: 30_000, den: 1001 };
    // frame 2 starts at 66 733 µs
    expect(frameCoverage([66_700, 66_800], fps).shown).toBe(2);
  });

  it("is empty for no frames", () => {
    expect(frameCoverage([], fps30)).toEqual({ shown: 0, expected: 0, droppedFraction: 0 });
  });
});

describe("summarize", () => {
  const frame = (wallMs: number, tUs: number, renderMs = 5): PresentedFrame => ({
    wallMs,
    tUs,
    renderMs,
    offsetUs: -2000,
  });

  it("ignores the warm-up, then reports rate, gaps and offsets", () => {
    const frames: PresentedFrame[] = [];
    for (let i = 0; i < 120; i += 1) frames.push(frame(i * 16.667, Math.round(i * 16_667)));
    frames.push(frame(120 * 16.667 + 80, 120 * 16_667 + 80_000)); // one 80 ms stall
    const report = summarize(frames, 500, fps30);
    expect(report.frames).toBeLessThan(frames.length);
    expect(report.presentedFps).toBeGreaterThan(55);
    expect(report.presentedFps).toBeLessThan(62);
    expect(report.longestGapMs).toBeGreaterThan(90);
    expect(report.offsetMsAbs.p95).toBe(2);
    expect(report.renderMs.p95).toBe(5);
  });

  it("has zero rate with fewer than two steady frames", () => {
    expect(summarize([frame(0, 0)], 0, fps30).presentedFps).toBe(0);
  });
});

describe("mulberry32", () => {
  it("repeats for a seed and stays in [0, 1)", () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    const first = Array.from({ length: 5 }, () => a());
    expect(first).toEqual(Array.from({ length: 5 }, () => b()));
    expect(first.every((v) => v >= 0 && v < 1)).toBe(true);
  });
});

describe("evaluateGates", () => {
  it("lists every failed gate with its numbers", () => {
    const result = evaluateGates([
      { name: "fps", actual: 28, limit: 30, kind: "min" },
      { name: "p95 render ms", actual: 20, limit: 33, kind: "max" },
      { name: "dropped %", actual: 2, limit: 1, kind: "max" },
    ]);
    expect(result.passed).toBe(false);
    expect(result.failures).toEqual(["fps: 28.00 (needs ≥ 30)", "dropped %: 2.00 (needs ≤ 1)"]);
    expect(evaluateGates([{ name: "x", actual: 31, limit: 30, kind: "min" }]).passed).toBe(true);
  });
});
