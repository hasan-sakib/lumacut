import { frameToUs } from "@lumacut/schema";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PX_PER_SEC,
  MAX_PX_PER_SEC,
  MIN_PX_PER_SEC,
  clampZoom,
  fitZoom,
  pxToUs,
  roundToFrame,
  rulerTicks,
  scrollAfterZoom,
  tickStepUs,
  usToPx,
  zoomBy,
} from "./geometry.ts";

const fps30 = { num: 30, den: 1 };
const fps2997 = { num: 30_000, den: 1001 };

describe("pixels and time", () => {
  it("convert both ways at a zoom", () => {
    expect(usToPx(1_000_000, 100)).toBe(100);
    expect(usToPx(2_500_000, 40)).toBe(100);
    expect(pxToUs(250, 100)).toBe(2_500_000);
    expect(pxToUs(usToPx(1_234_567, 200), 200)).toBe(1_234_567);
  });

  it("pxToUs returns whole microseconds", () => {
    expect(Number.isInteger(pxToUs(7, 3))).toBe(true);
  });
});

describe("zoom", () => {
  it("stays inside the limits", () => {
    expect(clampZoom(0.1)).toBe(MIN_PX_PER_SEC);
    expect(clampZoom(1e9)).toBe(MAX_PX_PER_SEC);
    expect(zoomBy(100, 2)).toBe(200);
    expect(zoomBy(MAX_PX_PER_SEC, 2)).toBe(MAX_PX_PER_SEC);
    expect(zoomBy(MIN_PX_PER_SEC, 0.5)).toBe(MIN_PX_PER_SEC);
  });

  it("fit makes the content fill the window minus a margin, with sane fallbacks", () => {
    expect(fitZoom(10_000_000, 840)).toBe(80);
    expect(fitZoom(0, 840)).toBe(DEFAULT_PX_PER_SEC);
    expect(fitZoom(10_000_000, 30)).toBe(DEFAULT_PX_PER_SEC);
    expect(fitZoom(1, 840)).toBe(MAX_PX_PER_SEC);
  });

  it("zooming keeps the time under the pointer still", () => {
    // 2 s is under the pointer at 200 px (100 px/s); after zooming to 200 px/s it must still be.
    const scroll = scrollAfterZoom(0, 200, 100, 200);
    expect(scroll).toBe(1_000_000);
    expect(scroll + pxToUs(200, 200)).toBe(2_000_000);
    expect(scrollAfterZoom(0, 200, 200, 100)).toBe(0); // can't scroll before the start
  });
});

describe("roundToFrame", () => {
  it("lands on frame starts, ties to the earlier frame, at 30 and 29.97", () => {
    expect(roundToFrame(0, fps30)).toBe(0);
    expect(roundToFrame(40_000, fps30)).toBe(frameToUs(1, fps30));
    expect(roundToFrame(60_000, fps30)).toBe(frameToUs(2, fps30));
    expect(roundToFrame(50_000, fps30)).toBe(frameToUs(1, fps30));
    expect(roundToFrame(66_700, fps2997)).toBe(frameToUs(2, fps2997));
    expect(roundToFrame(-5, fps30)).toBe(0);
  });
});

describe("ruler", () => {
  it("picks the smallest nice step that is wide enough", () => {
    expect(tickStepUs(100)).toBe(1_000_000);
    expect(tickStepUs(10)).toBe(10_000_000);
    expect(tickStepUs(4000)).toBe(20_000);
    expect(tickStepUs(MIN_PX_PER_SEC)).toBe(60_000_000);
    expect(tickStepUs(0.0001)).toBe(3_600_000_000);
  });

  it("makes ticks across the window: majors on the step, minors on its halves", () => {
    const ticks = rulerTicks(0, 500, 100);
    expect(ticks.map((t) => t.us)).toEqual([
      0, 500_000, 1_000_000, 1_500_000, 2_000_000, 2_500_000, 3_000_000, 3_500_000, 4_000_000,
      4_500_000, 5_000_000,
    ]);
    expect(ticks.filter((t) => t.major).map((t) => t.us)).toEqual([
      0, 1_000_000, 2_000_000, 3_000_000, 4_000_000, 5_000_000,
    ]);
  });

  it("starts at or before the scroll position so the left edge is never bare", () => {
    const ticks = rulerTicks(1_300_000, 300, 100);
    expect(ticks[0]?.us).toBe(1_000_000);
    expect(ticks.at(-1)?.us).toBeGreaterThanOrEqual(1_300_000 + 3_000_000 - 500_000);
  });
});
