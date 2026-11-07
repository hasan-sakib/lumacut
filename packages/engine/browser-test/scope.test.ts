import { createClip, createComposition, createTrack } from "@lumacut/schema";
import { afterEach, describe, expect, it } from "vitest";
import {
  createTestEngine,
  imageAsset,
  projectOf,
  type Rgba8,
  type TestEngine,
  type TestImage,
} from "./scene.ts";

let current: TestEngine | null = null;
afterEach(async () => {
  await current?.dispose();
  current = null;
});

/** Red on the top half, blue on the bottom half. */
const halves: TestImage = {
  id: "halves",
  width: 64,
  height: 36,
  pixel: (_x, y): Rgba8 => (y < 18 ? [255, 0, 0, 255] : [0, 0, 255, 255]),
};

async function setup() {
  const main = createComposition({
    id: "main",
    width: 64,
    height: 36,
    tracks: [
      createTrack({
        id: "t",
        kind: "visual",
        clips: [createClip({ id: "c", type: "media", assetId: "halves", outUs: 1_000_000 })],
      }),
    ],
  });
  current = await createTestEngine(projectOf([imageAsset(halves)], [main]), [halves]);
  return current.engine;
}

describe("engine scope sample", () => {
  it("is the picture shrunk to the requested width, top row first", async () => {
    const engine = await setup();
    const { scope } = await engine.renderAt("main", 0, { scopeWidth: 16 });
    expect(scope).toBeDefined();
    expect([scope?.width, scope?.height]).toEqual([16, 9]);
    const at = (x: number, y: number) =>
      Array.from(scope?.pixels.subarray((y * 16 + x) * 4, (y * 16 + x) * 4 + 4) ?? []);
    expect(at(8, 1)).toEqual([255, 0, 0, 255]); // top: red
    expect(at(8, 7)).toEqual([0, 0, 255, 255]); // bottom: blue
  });

  it("never asks for more than the picture has, and needs no readback of the full frame", async () => {
    const engine = await setup();
    const result = await engine.renderAt("main", 0, { scopeWidth: 1000 });
    expect(result.scope?.width).toBe(64);
    expect(result.pixels).toBeUndefined();
  });

  it("changes size between calls without leaking or breaking", async () => {
    const engine = await setup();
    for (const width of [32, 16, 32, 8]) {
      const { scope } = await engine.renderAt("main", 0, { scopeWidth: width });
      expect(scope?.width).toBe(width);
      expect(scope?.pixels.length).toBe(width * (scope?.height ?? 0) * 4);
    }
  });
});
