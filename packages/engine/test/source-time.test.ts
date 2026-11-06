import { frameToUs, usToFrame, type Rational } from "@lumacut/schema";
import { createClip } from "@lumacut/schema";
import { describe, expect, it } from "vitest";
import {
  SAMPLE_BIAS_US,
  clipDurationUs,
  clipEndUs,
  frameCenterSeconds,
  isClipActive,
  sourceFrameIndex,
  sourceInstantUs,
} from "../src/index.ts";

const FPS_LIST: [string, Rational][] = [
  ["24", { num: 24, den: 1 }],
  ["25", { num: 25, den: 1 }],
  ["29.97", { num: 30000, den: 1001 }],
  ["30", { num: 30, den: 1 }],
  ["60", { num: 60, den: 1 }],
];
const NTSC: Rational = { num: 30000, den: 1001 };

function clip(over: Parameters<typeof createClip>[0] extends infer T ? Partial<T> : never) {
  return createClip({ id: "c", type: "media", ...over });
}

describe("clip timing", () => {
  it("is active from its start (inclusive) to its end (exclusive)", () => {
    const c = clip({ startUs: 1_000_000, inUs: 0, outUs: 2_000_000 });
    expect(clipEndUs(c)).toBe(3_000_000);
    expect(isClipActive(c, 999_999)).toBe(false);
    expect(isClipActive(c, 1_000_000)).toBe(true);
    expect(isClipActive(c, 2_999_999)).toBe(true);
    expect(isClipActive(c, 3_000_000)).toBe(false);
  });

  it("speed changes the on-timeline length; empty clips are never active", () => {
    expect(clipDurationUs(clip({ outUs: 2_000_000, speed: 2 }))).toBe(1_000_000);
    expect(clipDurationUs(clip({ outUs: 1_000_000, speed: 0.5 }))).toBe(2_000_000);
    expect(isClipActive(clip({ inUs: 5, outUs: 5 }), 0)).toBe(false);
  });
});

describe.each(FPS_LIST)("source frame at %s fps", (_name, fps) => {
  const FRAMES = 120;
  const dur = frameToUs(FRAMES, fps);

  it("matches the timeline frame for every frame start and interior instant", () => {
    const c = clip({ outUs: dur });
    for (let n = 0; n < FRAMES; n += 1) {
      const start = frameToUs(n, fps);
      expect(sourceFrameIndex(c, start, fps), `frame ${String(n)} start`).toBe(n);
      expect(sourceFrameIndex(c, frameToUs(n + 1, fps) - 3, fps), `frame ${String(n)} end`).toBe(n);
      expect(usToFrame(Math.round(frameCenterSeconds(n, fps) * 1e6), fps)).toBe(n);
    }
  });

  it("stays frame-exact for trimmed clips placed on frame boundaries", () => {
    for (const i of [0, 1, 7, 29, 40]) {
      for (const a of [0, 3, 11, 30]) {
        const c = clip({
          startUs: frameToUs(a, fps),
          inUs: frameToUs(i, fps),
          outUs: frameToUs(i + 60, fps),
        });
        for (let k = 0; k < 60; k += 1) {
          const t = frameToUs(a + k, fps);
          expect(sourceFrameIndex(c, t, fps), `i=${String(i)} a=${String(a)} k=${String(k)}`).toBe(
            i + k,
          );
        }
      }
    }
  });

  it("plays reversed clips frame-exactly", () => {
    for (const i of [0, 9, 31]) {
      const c = clip({
        startUs: frameToUs(5, fps),
        inUs: frameToUs(i, fps),
        outUs: frameToUs(i + 50, fps),
        reversed: true,
      });
      for (let k = 0; k < 50; k += 1) {
        const t = frameToUs(5 + k, fps);
        expect(sourceFrameIndex(c, t, fps), `i=${String(i)} k=${String(k)}`).toBe(i + 49 - k);
      }
    }
  });

  it("maps speed changes onto the right frames", () => {
    const fast = clip({ outUs: frameToUs(100, fps), speed: 2 });
    const slow = clip({ outUs: frameToUs(40, fps), speed: 0.5 });
    for (let k = 0; k < 50; k += 1)
      expect(sourceFrameIndex(fast, frameToUs(k, fps), fps)).toBe(2 * k);
    for (let k = 0; k < 80; k += 2)
      expect(sourceFrameIndex(slow, frameToUs(k, fps), fps)).toBe(k / 2);
  });

  it("holds a freeze frame for the whole clip", () => {
    const c = clip({ outUs: frameToUs(30, fps), freezeAtUs: frameToUs(17, fps) });
    for (const t of [0, frameToUs(3, fps), frameToUs(29, fps)]) {
      expect(sourceFrameIndex(c, t, fps)).toBe(17);
    }
  });
});

describe("why the sampling bias exists", () => {
  it("naive µs mapping picks the wrong frame at 29.97 fps; the biased mapping never does", () => {
    let naiveWrong = 0;
    let biasedWrong = 0;
    for (let i = 0; i < 60; i += 1) {
      for (let a = 0; a < 40; a += 1) {
        const c = clip({
          startUs: frameToUs(a, NTSC),
          inUs: frameToUs(i, NTSC),
          outUs: frameToUs(i + 70, NTSC),
        });
        for (let k = 0; k < 70; k += 1) {
          const t = frameToUs(a + k, NTSC);
          if (usToFrame(c.inUs + (t - c.startUs), NTSC) !== i + k) naiveWrong += 1;
          if (sourceFrameIndex(c, t, NTSC) !== i + k) biasedWrong += 1;
        }
      }
    }
    expect(naiveWrong).toBeGreaterThan(0);
    expect(biasedWrong).toBe(0);
  });

  it("documents the tolerance zone: within the bias of the next frame start counts as next frame", () => {
    const c = clip({ outUs: frameToUs(10, NTSC) });
    const boundary = frameToUs(4, NTSC);
    expect(sourceFrameIndex(c, boundary - SAMPLE_BIAS_US - 1, NTSC)).toBe(3);
    expect(sourceFrameIndex(c, boundary - SAMPLE_BIAS_US, NTSC)).toBe(4);
  });
});

describe("sourceInstantUs", () => {
  it("never leaves the clip's source range", () => {
    const c = clip({ inUs: 1_000_000, outUs: 2_000_000 });
    expect(sourceInstantUs(c, -5_000_000)).toBe(1_000_000);
    expect(sourceInstantUs(c, 99_000_000)).toBe(1_999_999);
    const r = clip({ inUs: 1_000_000, outUs: 2_000_000, reversed: true });
    expect(sourceInstantUs(r, 0)).toBeLessThanOrEqual(1_999_999);
    expect(sourceInstantUs(r, 99_000_000)).toBe(1_000_000);
  });

  it("shows the freeze frame even when it lies outside in/out", () => {
    expect(sourceInstantUs(clip({ inUs: 0, outUs: 10, freezeAtUs: 5_000_000 }), 3)).toBe(
      5_000_000 + SAMPLE_BIAS_US,
    );
  });
});
