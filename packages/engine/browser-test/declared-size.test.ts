import {
  centeredTransform,
  createClip,
  createComposition,
  createTrack,
  type Asset,
} from "@lumacut/schema";
import { afterEach, describe, expect, it } from "vitest";
import { decodeBarcodeRgba, fixture } from "../src/testing/index.ts";
import {
  createTestEngine,
  imageAsset,
  projectOf,
  solidImage,
  videoAsset,
  type TestEngine,
} from "./scene.ts";

let current: TestEngine | null = null;
afterEach(async () => {
  await current?.dispose();
  current = null;
});

// A clip's transform is authored against the asset's size as probed from the original upload, but
// the engine reads a smaller proxy (the M1 proxy is at most 720p). The layer must occupy the
// asset's declared size whatever the proxy's pixel size is.
describe("layer size follows the asset's declared size, not the proxy's pixels", () => {
  it("a video whose proxy is half the declared size still covers the composition", async () => {
    const f = fixture("fx_30.mp4");
    const declared = { width: f.width * 2, height: f.height * 2 };
    const asset: Asset = videoAsset("fx_30.mp4");
    if (asset.video === undefined) throw new Error("fixture asset has no video info");
    asset.video = { ...asset.video, ...declared };
    const main = createComposition({
      id: "main",
      ...declared,
      fps: f.fps,
      durationUs: 1_000_000,
      tracks: [
        createTrack({
          id: "v",
          kind: "visual",
          clips: [
            createClip({
              id: "c",
              type: "media",
              assetId: asset.id,
              transform: centeredTransform(declared, declared),
            }),
          ],
        }),
      ],
    });
    current = await createTestEngine(projectOf([asset], [main]));
    const result = await current.engine.renderAt("main", 0, { readback: true });
    // The barcode strip is the bottom 1/12 of the picture: readable only if the layer fills the frame.
    expect(decodeBarcodeRgba(result.pixels, declared.width, declared.height, "top-left")).toBe(0);
  });

  it("an image decoded smaller than its declared size is stretched to it", async () => {
    const image = solidImage("red", 8, 8, [255, 0, 0, 255]);
    const declared = { width: 32, height: 32 };
    const asset = { ...imageAsset(image), image: declared };
    const main = createComposition({
      id: "main",
      ...declared,
      durationUs: 1_000_000,
      tracks: [
        createTrack({
          id: "v",
          kind: "visual",
          clips: [
            createClip({
              id: "c",
              type: "media",
              assetId: image.id,
              transform: centeredTransform(declared, declared),
            }),
          ],
        }),
      ],
    });
    current = await createTestEngine(projectOf([asset], [main]), [image]);
    const result = await current.engine.renderAt("main", 0, { readback: true });
    // Opposite corners are both opaque red only if the 8×8 image was scaled up to the 32×32 frame.
    const red = (x: number, y: number) => result.pixels[(y * declared.width + x) * 4];
    expect([red(1, 1), red(30, 30)]).toEqual([255, 255]);
  });
});
