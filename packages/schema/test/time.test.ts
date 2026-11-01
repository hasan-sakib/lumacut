import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Rational } from "../src/primitives.ts";
import {
  clipTimelineDurationUs,
  fpsToNumber,
  frameDurationUs,
  frameToUs,
  usToFrame,
} from "../src/time.ts";

const FPS_30: Rational = { num: 30, den: 1 };
const FPS_2997: Rational = { num: 30000, den: 1001 };
const FPS_24: Rational = { num: 24, den: 1 };
const FPS_60: Rational = { num: 60, den: 1 };
const RATES = [FPS_24, { num: 25, den: 1 }, FPS_30, FPS_2997, { num: 60000, den: 1001 }, FPS_60];

describe("frameToUs", () => {
  it("is exact for integer rates", () => {
    expect(frameToUs(0, FPS_30)).toBe(0);
    expect(frameToUs(1, FPS_30)).toBe(33_333);
    expect(frameToUs(2, FPS_30)).toBe(66_667);
    expect(frameToUs(30, FPS_30)).toBe(1_000_000);
    expect(frameToUs(24, FPS_24)).toBe(1_000_000);
    expect(frameToUs(60 * 60 * 30, FPS_60)).toBe(1_800_000_000);
  });

  it("is exact for NTSC rates", () => {
    // 30000/1001 fps: 1001 / 30000 s per frame.
    expect(frameToUs(1, FPS_2997)).toBe(33_367);
    expect(frameToUs(30_000, FPS_2997)).toBe(1_001_000_000);
  });

  it("rejects invalid frame indices", () => {
    expect(() => frameToUs(-1, FPS_30)).toThrow(RangeError);
    expect(() => frameToUs(1.5, FPS_30)).toThrow(RangeError);
  });
});

describe("usToFrame", () => {
  it("maps frame starts and boundaries", () => {
    expect(usToFrame(0, FPS_30)).toBe(0);
    expect(usToFrame(33_332, FPS_30)).toBe(0);
    expect(usToFrame(33_333, FPS_30)).toBe(1);
    expect(usToFrame(66_666, FPS_30)).toBe(1);
    expect(usToFrame(66_667, FPS_30)).toBe(2);
  });

  it("rejects invalid times", () => {
    expect(() => usToFrame(-1, FPS_30)).toThrow(RangeError);
    expect(() => usToFrame(0.5, FPS_30)).toThrow(RangeError);
  });

  it("round-trips every frame start (property)", () => {
    fc.assert(
      fc.property(fc.constantFrom(...RATES), fc.integer({ min: 0, max: 200_000 }), (fps, f) => {
        expect(usToFrame(frameToUs(f, fps), fps)).toBe(f);
      }),
    );
  });

  it("places any time inside its frame period (property)", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...RATES),
        fc.integer({ min: 0, max: 7_200_000_000 }),
        (fps, t) => {
          const f = usToFrame(t, fps);
          expect(frameToUs(f, fps)).toBeLessThanOrEqual(t);
          expect(frameToUs(f + 1, fps)).toBeGreaterThan(t);
        },
      ),
    );
  });
});

describe("frameDurationUs / fpsToNumber", () => {
  it("alternates periods for 30 fps so frames sum exactly to one second", () => {
    let total = 0;
    for (let f = 0; f < 30; f += 1) total += frameDurationUs(f, FPS_30);
    expect(total).toBe(1_000_000);
    expect(fpsToNumber(FPS_2997)).toBeCloseTo(29.97, 2);
  });
});

describe("clipTimelineDurationUs", () => {
  it("divides by speed and rounds to the nearest microsecond", () => {
    expect(clipTimelineDurationUs({ inUs: 0, outUs: 1_000_000, speed: 1 })).toBe(1_000_000);
    expect(clipTimelineDurationUs({ inUs: 0, outUs: 1_000_000, speed: 2 })).toBe(500_000);
    expect(clipTimelineDurationUs({ inUs: 0, outUs: 1_000_000, speed: 3 })).toBe(333_333);
    expect(clipTimelineDurationUs({ inUs: 0, outUs: 1_000_000, speed: 0.3 })).toBe(3_333_333);
    expect(clipTimelineDurationUs({ inUs: 5, outUs: 6, speed: 0.5 })).toBe(2);
  });

  it("rejects inverted ranges and invalid speeds", () => {
    expect(() => clipTimelineDurationUs({ inUs: 10, outUs: 5, speed: 1 })).toThrow(RangeError);
    expect(() => clipTimelineDurationUs({ inUs: 0, outUs: 5, speed: 0 })).toThrow(RangeError);
    expect(() => clipTimelineDurationUs({ inUs: 0, outUs: 5, speed: -1 })).toThrow(RangeError);
    expect(() => clipTimelineDurationUs({ inUs: 0, outUs: 5, speed: Infinity })).toThrow(
      RangeError,
    );
    expect(() => clipTimelineDurationUs({ inUs: 0.5, outUs: 5, speed: 1 })).toThrow(RangeError);
  });
});
