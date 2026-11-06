import {
  centeredTransform,
  createClip,
  createComposition,
  createTrack,
  type Clip,
  type Composition,
} from "@lumacut/schema";
import { afterEach, describe, expect, it } from "vitest";
import { pixelAt } from "../src/testing/index.ts";
import {
  createTestEngine,
  encode8,
  imageAsset,
  projectOf,
  solidImage,
  type Rgba8,
  type TestEngine,
  type TestImage,
} from "./scene.ts";

let current: TestEngine | null = null;
afterEach(async () => {
  await current?.dispose();
  current = null;
});

const RED: Rgba8 = [255, 0, 0, 255];
const BLUE: Rgba8 = [0, 0, 255, 255];
const BLACK: Rgba8 = [0, 0, 0, 255];
const SIZE = 64;

/** Renders one layer (and optional extras) in a 64x64 composition and returns a pixel reader. */
async function renderScene(
  image: TestImage,
  clip: Partial<Clip>,
  options: { background?: Composition["background"]; extra?: Clip[]; images?: TestImage[] } = {},
) {
  const main = createComposition({
    id: "main",
    width: SIZE,
    height: SIZE,
    durationUs: 1_000_000,
    ...(options.background ? { background: options.background } : {}),
    tracks: [
      createTrack({
        id: "v1",
        kind: "visual",
        clips: [
          createClip({ id: "c1", type: "media", assetId: image.id, ...clip }),
          ...(options.extra ?? []),
        ],
      }),
    ],
  });
  const images = [image, ...(options.images ?? [])];
  current = await createTestEngine(projectOf(images.map(imageAsset), [main]), images);
  const result = await current.engine.renderAt("main", 0, { readback: true });
  const pixels = result.pixels;
  return { result, at: (x: number, y: number) => pixelAt(pixels, SIZE, x, y) };
}

/** Compares colours allowing a little rounding from 8-bit storage and GPU float maths. */
function expectColor(actual: readonly number[], expected: Rgba8, tolerance = 2): void {
  expected.forEach((want, i) => {
    expect(
      Math.abs((actual[i] ?? -999) - want),
      `channel ${String(i)} of ${actual.join(",")} vs ${expected.join(",")}`,
    ).toBeLessThanOrEqual(tolerance);
  });
}

describe("compositing geometry", () => {
  it("draws a layer 1:1 at the composition origin, and nothing outside it", async () => {
    const { at } = await renderScene(solidImage("red", 32, 32, RED), {});
    expectColor(at(0, 0), RED);
    expectColor(at(31, 31), RED);
    expectColor(at(32, 32), BLACK);
    expectColor(at(63, 5), BLACK);
  });

  it("places a layer by its anchor point", async () => {
    const image = solidImage("red", 20, 20, RED);
    const { at } = await renderScene(image, {
      transform: centeredTransform({ width: SIZE, height: SIZE }, image),
    });
    expectColor(at(22, 22), RED);
    expectColor(at(41, 41), RED);
    expectColor(at(21, 21), BLACK);
    expectColor(at(42, 42), BLACK);
  });

  it("scales about the anchor, independently per axis", async () => {
    const image = solidImage("red", 10, 10, RED);
    const uniform = await renderScene(image, {
      transform: { ...createClip({ id: "x", type: "solid" }).transform, scaleX: 3, scaleY: 3 },
    });
    expectColor(uniform.at(29, 29), RED);
    expectColor(uniform.at(31, 31), BLACK);
    const wide = await renderScene(image, {
      transform: { ...createClip({ id: "x", type: "solid" }).transform, scaleX: 2, scaleY: 1 },
    });
    expectColor(wide.at(19, 9), RED);
    expectColor(wide.at(21, 9), BLACK);
    expectColor(wide.at(5, 11), BLACK);
  });

  it("rotates clockwise about the anchor", async () => {
    const image: TestImage = {
      id: "split",
      width: 40,
      height: 20,
      pixel: (x) => (x < 20 ? RED : BLUE),
    };
    const base = centeredTransform({ width: SIZE, height: SIZE }, image);
    const { at } = await renderScene(image, { transform: { ...base, rotation: 90 } });
    // After a 90° clockwise turn the left (red) half is on top and the right (blue) half below.
    expectColor(at(32, 14), RED);
    expectColor(at(32, 50), BLUE);
    expectColor(at(14, 32), BLACK);
    expectColor(at(50, 32), BLACK);
  });

  it("skews so that a positive angle leans the top to the right", async () => {
    const image = solidImage("red", 20, 20, RED);
    const base = centeredTransform({ width: SIZE, height: SIZE }, image);
    const { at } = await renderScene(image, { transform: { ...base, skew: 45 } });
    expectColor(at(44, 23), RED); // top row shifted right by ~10 (spans x 30.5..50.5)
    expectColor(at(24, 23), BLACK);
    expectColor(at(14, 41), RED); // bottom row shifted left by ~10
    expectColor(at(40, 41), BLACK);
  });

  it("crops from each edge while keeping the layer's anchor reference", async () => {
    const image = solidImage("red", 40, 40, RED);
    const { at } = await renderScene(image, { crop: { left: 0.5, top: 0, right: 0, bottom: 0.5 } });
    expectColor(at(30, 10), RED);
    expectColor(at(10, 10), BLACK); // left half removed
    expectColor(at(30, 30), BLACK); // bottom half removed
  });

  it("stacks layers bottom to top and shows only clips that are active at the time", async () => {
    const red = solidImage("red", 40, 40, RED);
    const blue = solidImage("blue", 20, 20, BLUE);
    const late = createClip({
      id: "late",
      type: "media",
      assetId: "blue",
      startUs: 500_000,
      outUs: 500_000,
    });
    const above = createClip({ id: "above", type: "media", assetId: "blue" });
    const { at } = await renderScene(red, {}, { images: [blue], extra: [above, late] });
    expectColor(at(10, 10), BLUE); // later in the array = on top
    expectColor(at(30, 30), RED);
  });

  it("skips hidden tracks and non-visual tracks", async () => {
    const red = solidImage("red", 32, 32, RED);
    const main = createComposition({
      id: "main",
      width: SIZE,
      height: SIZE,
      tracks: [
        createTrack({
          id: "hidden",
          kind: "visual",
          hidden: true,
          clips: [createClip({ id: "c1", type: "media", assetId: "red" })],
        }),
        createTrack({
          id: "audio",
          kind: "audio",
          clips: [createClip({ id: "c2", type: "media", assetId: "red" })],
        }),
      ],
    });
    current = await createTestEngine(projectOf([imageAsset(red)], [main]), [red]);
    const { pixels } = await current.engine.renderAt("main", 0, { readback: true });
    expectColor(pixelAt(pixels, SIZE, 10, 10), BLACK);
  });
});

describe("opacity and colour space", () => {
  it("composites in linear light: 50% red over black is sRGB 188, not 128", async () => {
    const { at } = await renderScene(solidImage("red", 64, 64, RED), { opacity: 0.5 });
    expectColor(at(32, 32), [encode8(0.5), 0, 0, 255]);
    expect(encode8(0.5)).toBe(188);
  });

  it("mixes with the backdrop colour in linear light", async () => {
    const white = { r: 1, g: 1, b: 1, a: 1 };
    const { at } = await renderScene(
      solidImage("red", 64, 64, RED),
      { opacity: 0.5 },
      { background: white },
    );
    expectColor(at(32, 32), [255, encode8(0.5), encode8(0.5), 255]);
  });

  it("round-trips opaque colours unchanged", async () => {
    const swatch: Rgba8 = [37, 142, 201, 255];
    const { at } = await renderScene(solidImage("swatch", 64, 64, swatch), {});
    expectColor(at(10, 10), swatch, 1);
  });

  it("leaves untouched areas transparent when the background has no alpha", async () => {
    const clear = { r: 0, g: 0, b: 0, a: 0 };
    const { at } = await renderScene(solidImage("red", 16, 16, RED), {}, { background: clear });
    expectColor(at(40, 40), [0, 0, 0, 0]);
    expectColor(at(5, 5), RED);
  });

  it("premultiplies semi-transparent image pixels correctly", async () => {
    const half: Rgba8 = [255, 0, 0, 128];
    const clear = { r: 0, g: 0, b: 0, a: 0 };
    const { at } = await renderScene(solidImage("half", 64, 64, half), {}, { background: clear });
    const [r, g, b, a] = at(32, 32);
    // Premultiplied output: encoded colour (full red) times alpha (128/255).
    expect(Math.abs(a - 128)).toBeLessThanOrEqual(2);
    expect(Math.abs(r - 128)).toBeLessThanOrEqual(3);
    expect([g, b]).toEqual([0, 0]);
  });
});
