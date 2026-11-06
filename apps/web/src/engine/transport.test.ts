import { frameToUs } from "@lumacut/schema";
import { describe, expect, it } from "vitest";
import { formatTimecode, lastFrameUs, skipTarget, stepTarget } from "./transport.ts";

const fps30 = { num: 30, den: 1 };
const fps2997 = { num: 30_000, den: 1001 };
const TEN_S = 10_000_000;

describe("lastFrameUs", () => {
  it("is the start of the final frame, not the end of the composition", () => {
    expect(lastFrameUs(TEN_S, fps30)).toBe(frameToUs(299, fps30));
    expect(lastFrameUs(0, fps30)).toBe(0);
  });
});

describe("stepTarget", () => {
  it("moves exactly one frame on a frame boundary, at 29.97 too", () => {
    expect(stepTarget(0, 1, fps30, TEN_S)).toBe(frameToUs(1, fps30));
    expect(stepTarget(frameToUs(5, fps2997), 1, fps2997, TEN_S)).toBe(frameToUs(6, fps2997));
    expect(stepTarget(frameToUs(5, fps2997), -1, fps2997, TEN_S)).toBe(frameToUs(4, fps2997));
  });

  it("steps from the middle of a frame to the neighbouring frame boundary", () => {
    const mid = frameToUs(7, fps30) + 10_000;
    expect(stepTarget(mid, 1, fps30, TEN_S)).toBe(frameToUs(8, fps30));
    expect(stepTarget(mid, -1, fps30, TEN_S)).toBe(frameToUs(6, fps30));
  });

  it("stops at both ends", () => {
    expect(stepTarget(0, -1, fps30, TEN_S)).toBe(0);
    expect(stepTarget(TEN_S, 1, fps30, TEN_S)).toBe(frameToUs(299, fps30));
  });
});

describe("skipTarget", () => {
  it("jumps whole seconds onto a frame boundary and clamps", () => {
    expect(skipTarget(0, 1, fps30, TEN_S)).toBe(1_000_000);
    expect(skipTarget(2_000_000, -1, fps30, TEN_S)).toBe(1_000_000);
    expect(skipTarget(500_000, -1, fps30, TEN_S)).toBe(0);
    expect(skipTarget(9_500_000, 1, fps30, TEN_S)).toBe(frameToUs(299, fps30));
    expect(skipTarget(1_000_000, 1, fps2997, TEN_S) % 1).toBe(0);
  });
});

describe("formatTimecode", () => {
  it("shows hours, minutes, seconds and frames", () => {
    expect(formatTimecode(0, fps30)).toBe("00:00:00:00");
    expect(formatTimecode(frameToUs(31, fps30), fps30)).toBe("00:00:01:01");
    expect(formatTimecode(3_723_000_000, fps30)).toBe("01:02:03:00");
    expect(formatTimecode(frameToUs(45, fps2997), fps2997)).toBe("00:00:01:15");
  });
});
