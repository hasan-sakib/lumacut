import { createClip, createComposition, createTrack, frameToUs } from "@lumacut/schema";
import { describe, expect, it } from "vitest";
import { activeVisualClips, frameCenterSeconds } from "../src/index.ts";

const media = (id: string, startUs: number, outUs: number) =>
  createClip({ id, type: "media", assetId: "a", startUs, outUs });

describe("activeVisualClips", () => {
  const comp = createComposition({
    id: "main",
    width: 1920,
    height: 1080,
    tracks: [
      createTrack({
        id: "bottom",
        kind: "visual",
        clips: [media("b1", 0, 2_000_000), media("b2", 2_000_000, 1_000_000)],
      }),
      createTrack({ id: "audio", kind: "audio", clips: [media("a1", 0, 5_000_000)] }),
      createTrack({
        id: "hidden",
        kind: "visual",
        hidden: true,
        clips: [media("h1", 0, 5_000_000)],
      }),
      createTrack({ id: "top", kind: "visual", clips: [media("t1", 1_000_000, 5_000_000)] }),
    ],
  });

  it("lists clips bottom to top and skips audio and hidden tracks", () => {
    const ids = (t: number) => activeVisualClips(comp, t).map((a) => a.clip.id);
    expect(ids(0)).toEqual(["b1"]);
    expect(ids(1_500_000)).toEqual(["b1", "t1"]);
    expect(ids(2_000_000)).toEqual(["b2", "t1"]);
    expect(ids(9_000_000)).toEqual([]);
  });

  it("reports where each clip lives", () => {
    const [first, second] = activeVisualClips(comp, 1_500_000);
    expect(first).toMatchObject({ trackId: "bottom", trackIndex: 0, clipIndex: 0 });
    expect(second).toMatchObject({ trackId: "top", trackIndex: 3, clipIndex: 0 });
  });
});

describe("frameCenterSeconds", () => {
  it("lies strictly inside the frame interval", () => {
    const fps = { num: 30000, den: 1001 };
    for (let n = 0; n < 500; n += 1) {
      const centerUs = frameCenterSeconds(n, fps) * 1e6;
      expect(centerUs).toBeGreaterThan(frameToUs(n, fps));
      expect(centerUs).toBeLessThan(frameToUs(n + 1, fps));
    }
  });
});
