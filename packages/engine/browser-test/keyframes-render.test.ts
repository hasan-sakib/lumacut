import { evaluate } from "@lumacut/ops";
import {
  createClip,
  createComposition,
  createTrack,
  type Clip,
  type Keyframe,
} from "@lumacut/schema";
import { afterEach, describe, expect, it } from "vitest";
import { maxChannelDiff } from "../src/testing/index.ts";
import { createTestEngine, imageAsset, projectOf, solidImage, type TestEngine } from "./scene.ts";

const SEC = 1_000_000;
const W = 64;
const H = 36;
const white = solidImage("white", 16, 16, [255, 255, 255, 255]);

let current: TestEngine | null = null;
afterEach(async () => {
  await current?.dispose();
  current = null;
});

const key = (tUs: number, value: Keyframe["value"], extra: Partial<Keyframe> = {}): Keyframe => ({
  tUs,
  value,
  interpolation: "linear",
  ...extra,
});

async function frameAt(clip: Clip, tUs: number): Promise<Uint8Array> {
  const main = createComposition({
    id: "main",
    width: W,
    height: H,
    durationUs: 4 * SEC,
    tracks: [createTrack({ id: "t", kind: "visual", clips: [clip] })],
  });
  current = await createTestEngine(projectOf([imageAsset(white)], [main]), [white]);
  const result = await current.engine.renderAt("main", tUs, { readback: true });
  await current.dispose();
  current = null;
  return result.pixels;
}

const base = (extra: Partial<Clip>): Clip =>
  createClip({
    id: "c",
    type: "media",
    assetId: "white",
    startUs: SEC, // keyframes are clip-local: this checks the offset is applied
    inUs: 0,
    outUs: 2 * SEC,
    ...extra,
  });

describe("animated properties are drawn", () => {
  it("opacity at time t equals the same clip with that opacity set statically", async () => {
    const animated = base({
      opacity: 1,
      keyframes: {
        opacity: [
          key(0, 0, { interpolation: "bezier", easeOut: { influence: 50, speed: 0 } }),
          key(SEC, 1, { easeIn: { influence: 50, speed: 0 } }),
        ],
      },
    });
    for (const local of [0, 0.2, 0.5, 0.8, 1]) {
      const t = SEC + local * SEC;
      const expected = evaluate(animated, "opacity", local * SEC);
      expect(typeof expected).toBe("number");
      const staticClip = base({ opacity: expected as number });
      const a = await frameAt(animated, t);
      const b = await frameAt(staticClip, t);
      expect(maxChannelDiff(a, b), `local ${String(local)} s`).toBe(0);
    }
    // And it really animates: the frames differ between the start and the end.
    const start = await frameAt(animated, SEC);
    const end = await frameAt(animated, 2 * SEC);
    expect(maxChannelDiff(start, end)).toBeGreaterThan(100);
  });

  it("position follows its path, including a spatial curve", async () => {
    const animated = base({
      transform: { ...createClip({ id: "x", type: "media" }).transform, x: 0, y: 0 },
      keyframes: {
        "transform.position": [
          key(0, [8, 8], { spatialTangents: { in: [0, 0], out: [30, 0] } }),
          key(SEC, [56, 28], { spatialTangents: { in: [-30, 0], out: [0, 0] } }),
        ],
      },
    });
    for (const local of [0, 0.3, 0.6, 1]) {
      const t = SEC + local * SEC;
      const at = evaluate(animated, "transform.position", local * SEC) as [number, number];
      const staticClip = base({
        transform: { ...animated.transform, x: at[0], y: at[1] },
      });
      const a = await frameAt(animated, t);
      const b = await frameAt(staticClip, t);
      expect(maxChannelDiff(a, b), `local ${String(local)} s`).toBe(0);
    }
  });

  it("before the first keyframe and after the last, the end values hold", async () => {
    const animated = base({
      keyframes: { opacity: [key(0.5 * SEC, 0.2), key(1.5 * SEC, 0.9)] },
    });
    const early = await frameAt(animated, SEC); // local 0, before the first key
    const first = await frameAt(base({ opacity: 0.2 }), SEC);
    expect(maxChannelDiff(early, first)).toBe(0);
    const late = await frameAt(animated, 2.9 * SEC);
    const last = await frameAt(base({ opacity: 0.9 }), 2.9 * SEC);
    expect(maxChannelDiff(late, last)).toBe(0);
  });
});
