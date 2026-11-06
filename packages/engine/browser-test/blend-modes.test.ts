import { createClip, createComposition, createTrack, type BlendMode } from "@lumacut/schema";
import { describe, expect, it } from "vitest";
import { BLEND_MODES, compositePixel, type Rgba } from "../src/index.ts";
import { pixelAt } from "../src/testing/index.ts";
import {
  at,
  createTestEngine,
  imageAsset,
  linearToSrgb,
  projectOf,
  srgbToLinear,
  type Rgba8,
  type TestImage,
} from "./scene.ts";

type Rgb8 = readonly [number, number, number];

// Every (backdrop, source) pair of these colours appears once in a 25-pixel strip.
const BACKDROPS: Rgb8[] = [
  [0, 0, 0],
  [255, 255, 255],
  [200, 60, 40],
  [30, 160, 220],
  [128, 128, 128],
];
const SOURCES: Rgb8[] = [
  [255, 255, 255],
  [0, 0, 0],
  [90, 200, 70],
  [220, 120, 180],
  [60, 60, 60],
];
const CELLS = BACKDROPS.length * SOURCES.length;

const backdropOf = (cell: number): Rgb8 => at(BACKDROPS, cell % BACKDROPS.length);
const sourceOf = (cell: number): Rgb8 => at(SOURCES, Math.floor(cell / BACKDROPS.length));

function strip(id: string, alpha: number, colorOf: (cell: number) => Rgb8): TestImage {
  return {
    id,
    width: CELLS,
    height: 1,
    pixel: (x): Rgba8 => [...colorOf(x), alpha],
  };
}

const lin = (c: Rgb8): [number, number, number] => [
  srgbToLinear(c[0] / 255),
  srgbToLinear(c[1] / 255),
  srgbToLinear(c[2] / 255),
];

/** What the canvas should hold for a straight linear colour: premultiplied, sRGB-encoded, 8-bit. */
function toCanvas(c: Rgba): [number, number, number, number] {
  const [r, g, b, a] = c;
  const enc = (v: number): number =>
    Math.round(linearToSrgb(Math.min(1, Math.max(0, v))) * 255 * a);
  return [enc(r), enc(g), enc(b), Math.round(a * 255)];
}

interface Case {
  name: string;
  backdropAlpha: number;
  sourceAlpha: number;
  opacity: number;
  background: { r: number; g: number; b: number; a: number };
  tolerance: number;
}

const CASES: Case[] = [
  {
    name: "opaque layers",
    backdropAlpha: 255,
    sourceAlpha: 255,
    opacity: 1,
    background: { r: 0, g: 0, b: 0, a: 1 },
    tolerance: 2,
  },
  {
    name: "partly transparent layers",
    backdropAlpha: 204,
    sourceAlpha: 153,
    opacity: 0.75,
    background: { r: 0, g: 0, b: 0, a: 0 },
    tolerance: 3,
  },
];

describe.each(CASES)("GPU blend modes vs the reference: $name", (testCase) => {
  it.each(BLEND_MODES)("%s", async (mode: BlendMode) => {
    // Fresh images for this case (alphas differ); the engine reloads them under new asset ids.
    const suffix = `${testCase.name}-${mode}`;
    const images = [
      strip(`backdrop-${suffix}`, testCase.backdropAlpha, backdropOf),
      strip(`source-${suffix}`, testCase.sourceAlpha, sourceOf),
    ];
    const local = await createTestEngine(
      projectOf(images.map(imageAsset), [
        createComposition({
          id: "main",
          width: CELLS,
          height: 1,
          background: testCase.background,
          tracks: [
            createTrack({
              id: "v",
              kind: "visual",
              clips: [
                createClip({ id: "back", type: "media", assetId: `backdrop-${suffix}` }),
                createClip({
                  id: "src",
                  type: "media",
                  assetId: `source-${suffix}`,
                  blendMode: mode,
                  opacity: testCase.opacity,
                }),
              ],
            }),
          ],
        }),
      ]),
      images,
    );
    try {
      const { pixels } = await local.engine.renderAt("main", 0, { readback: true });
      const worst = { diff: 0, cell: -1 };
      for (let cell = 0; cell < CELLS; cell += 1) {
        const backdrop: Rgba = [...lin(backdropOf(cell)), testCase.backdropAlpha / 255];
        const source: Rgba = [...lin(sourceOf(cell)), testCase.sourceAlpha / 255];
        const want = toCanvas(compositePixel(mode, backdrop, source, testCase.opacity));
        const got = pixelAt(pixels, CELLS, cell, 0);
        const diff = Math.max(...want.map((w, i) => Math.abs(w - (got[i] ?? 0))));
        if (diff > worst.diff) Object.assign(worst, { diff, cell });
        if (diff > testCase.tolerance) {
          throw new Error(
            `${mode}, cell ${String(cell)} (backdrop ${backdropOf(cell).join(",")} source ${sourceOf(cell).join(",")}): ` +
              `GPU ${got.join(",")} but reference ${want.join(",")}`,
          );
        }
      }
      expect(worst.diff).toBeLessThanOrEqual(testCase.tolerance);
    } finally {
      await local.dispose();
    }
  });
});

describe("blend mode catalogue", () => {
  it("really does something different for every mode (none silently falls back to normal)", () => {
    const backdrop: Rgba = [...lin([200, 60, 40]), 1];
    const source: Rgba = [...lin([90, 200, 70]), 1];
    const normal = compositePixel("normal", backdrop, source);
    const distinct = BLEND_MODES.filter((m) => m !== "normal").filter((m) => {
      const out = compositePixel(m, backdrop, source);
      return out.some((v, i) => Math.abs(v - (normal[i] ?? 0)) > 1e-3);
    });
    expect(distinct).toHaveLength(BLEND_MODES.length - 1);
  });
});
