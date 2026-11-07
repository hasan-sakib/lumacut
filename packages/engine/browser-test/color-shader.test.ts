import {
  createClip,
  createComposition,
  createTrack,
  neutralColor,
  type Clip,
  type ColorSettings,
} from "@lumacut/schema";
import { afterEach, describe, expect, it } from "vitest";
import { builtinLut } from "../src/color/builtin-luts.ts";
import { curveTable } from "../src/color/curves.ts";
import { gradeColor, toLinear, toSrgb, type Rgb } from "../src/color/reference.ts";
import { parseCube } from "../src/color/cube.ts";
import { hasCurves } from "../src/color/settings.ts";
import { maxChannelDiff } from "../src/testing/index.ts";
import {
  createTestEngine,
  imageAsset,
  projectOf,
  type Rgba8,
  type TestEngine,
  type TestImage,
} from "./scene.ts";

const SIZE = 32;
/** Every pixel is a different opaque colour, spread over the whole RGB cube. */
const palette: TestImage = {
  id: "palette",
  width: SIZE,
  height: SIZE,
  pixel: (x, y): Rgba8 => [x * 8 + 4, y * 8 + 4, (x * 13 + y * 29) % 256, 255],
};

let current: TestEngine | null = null;
afterEach(async () => {
  await current?.dispose();
  current = null;
});

async function render(clip: Clip, compSize = SIZE, images: TestImage[] = [palette]) {
  const main = createComposition({
    id: "main",
    width: compSize,
    height: compSize,
    tracks: [createTrack({ id: "t", kind: "visual", clips: [clip] })],
  });
  current = await createTestEngine(projectOf(images.map(imageAsset), [main]), images);
  const result = await current.engine.renderAt("main", 0, { readback: true });
  return result;
}

const clipWith = (color: Partial<ColorSettings>, extra: Partial<Clip> = {}): Clip =>
  createClip({
    id: "c",
    type: "media",
    assetId: "palette",
    outUs: 1_000_000,
    color: { ...neutralColor(), ...color },
    ...extra,
  });

/** What the TypeScript reference says each pixel should become, as 8-bit sRGB. */
function expectedPixels(settings: ColorSettings, lut = false): number[] {
  const curves = hasCurves(settings) ? curveTable(settings.curves) : undefined;
  const cube =
    lut && settings.lut !== undefined && settings.lut.intensity > 0
      ? builtinLut(settings.lut.lutId)
      : undefined;
  const out: number[] = [];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const [r, g, b] = palette.pixel(x, y);
      const linear: Rgb = [toLinear(r / 255), toLinear(g / 255), toLinear(b / 255)];
      const graded = gradeColor(linear, { settings, curves, lut: cube });
      out.push(...graded.map((v) => Math.round(Math.min(1, Math.max(0, toSrgb(v))) * 255)), 255);
    }
  }
  return out;
}

/** Largest per-channel difference between the rendered frame and the reference. */
function worst(pixels: Uint8Array, expected: number[]): number {
  let max = 0;
  for (let i = 0; i < expected.length; i++) {
    max = Math.max(max, Math.abs((pixels[i] ?? 0) - (expected[i] ?? 0)));
  }
  return max;
}

const TOLERANCE = 2; // 16-bit float storage and GPU maths vs 64-bit reference

const curveDiag: [number, number][] = [
  [0, 0],
  [1, 1],
];
const flat: [number, number][] = [
  [0, 0.5],
  [1, 0.5],
];
const band = (hue = 0, saturation = 0, luminance = 0) => ({ hue, saturation, luminance });
const bands = (over: Record<string, ReturnType<typeof band>> = {}) => ({
  red: band(),
  orange: band(),
  yellow: band(),
  green: band(),
  aqua: band(),
  blue: band(),
  purple: band(),
  magenta: band(),
  ...over,
});

const CASES: [string, Partial<ColorSettings>][] = [
  ["exposure", { exposure: 0.7 }],
  ["negative exposure", { exposure: -1.2 }],
  ["white balance", { temperature: 60, tint: -30 }],
  ["contrast", { contrast: 0.4 }],
  ["tone regions", { highlights: -0.6, shadows: 0.5, whites: 0.3, blacks: -0.4 }],
  [
    "wheels",
    {
      lift: [0.2, 0, -0.1],
      gamma: [0.1, -0.2, 0.3],
      gain: [-0.1, 0.2, 0],
      offset: [0.05, 0, -0.05],
    },
  ],
  ["saturation and vibrance", { saturation: 0.3, vibrance: 0.6 }],
  ["desaturated", { saturation: -1 }],
  [
    "master and channel curves",
    {
      curves: {
        master: [
          [0, 0],
          [0.3, 0.2],
          [0.7, 0.85],
          [1, 1],
        ],
        r: [
          [0, 0],
          [0.5, 0.62],
          [1, 1],
        ],
        g: curveDiag,
        b: [
          [0, 0.05],
          [1, 0.9],
        ],
      },
    },
  ],
  [
    "hue curves",
    {
      curves: {
        master: curveDiag,
        r: curveDiag,
        g: curveDiag,
        b: curveDiag,
        hueVsSat: [
          [0, 0.8],
          [0.33, 0.3],
          [0.66, 0.5],
          [1, 0.8],
        ],
        hueVsHue: [
          [0, 0.5],
          [0.5, 0.62],
          [1, 0.5],
        ],
        lumVsSat: flat,
      },
    },
  ],
  [
    "HSL bands",
    {
      hsl: bands({
        red: band(0.5, -0.4, 0.2),
        blue: band(-0.3, 0.5, -0.2),
        green: band(0, 0.6, 0),
      }),
    },
  ],
  ["a built-in LUT", { lut: { lutId: "builtin:teal-orange", intensity: 1 } }],
  ["a LUT at half strength", { lut: { lutId: "builtin:vivid", intensity: 0.5 } }],
  [
    "everything at once",
    {
      temperature: 20,
      exposure: 0.3,
      contrast: 0.2,
      shadows: 0.2,
      lift: [0.1, 0, 0],
      saturation: 0.1,
      hsl: bands({ red: band(0.2, 0.2, 0) }),
      curves: {
        master: [
          [0, 0],
          [0.5, 0.45],
          [1, 1],
        ],
        r: curveDiag,
        g: curveDiag,
        b: curveDiag,
      },
      lut: { lutId: "builtin:warm-film", intensity: 0.7 },
    },
  ],
];

describe("the colour shader matches the TypeScript reference", () => {
  it.each(CASES)("%s", async (_name, color) => {
    const result = await render(clipWith(color));
    const settings = { ...neutralColor(), ...color };
    expect(result.diagnostics).toEqual([]);
    expect(worst(result.pixels, expectedPixels(settings, true))).toBeLessThanOrEqual(TOLERANCE);
    // And it really changed the picture (a no-op pass would also "match" a no-op reference).
    const plain = await render(clipWith({}));
    expect(maxChannelDiff(result.pixels, plain.pixels)).toBeGreaterThan(3);
  });

  it("a neutral grade takes the direct path and leaves the picture exactly as it is", async () => {
    const result = await render(clipWith({}));
    const expected = expectedPixels(neutralColor());
    expect(worst(result.pixels, expected)).toBeLessThanOrEqual(1);
  });

  it("a missing LUT is reported and the clip is shown ungraded", async () => {
    const result = await render(clipWith({ lut: { lutId: "no-such-lut", intensity: 1 } }));
    expect(result.diagnostics.map((d) => d.code)).toEqual(["lut_unavailable"]);
    const plain = await render(clipWith({}));
    expect(maxChannelDiff(result.pixels, plain.pixels)).toBeLessThanOrEqual(1);
  });

  it("no longer reports colour as ignored", async () => {
    const result = await render(clipWith({ exposure: 1 }));
    expect(result.diagnostics.map((d) => d.code)).not.toContain("ignored_color");
  });
});

describe("the grade keeps the layer's geometry (crop, scale, rotation) and transparency", () => {
  const tiny = { exposure: 0.001 }; // not neutral, so the processed path runs, but invisible
  // Layers with colour work are resampled in linear light, plain layers in encoded values (a
  // difference that only shows on sharp edges), so geometry is compared on a smooth picture.
  const smooth: TestImage = {
    id: "smooth",
    width: SIZE,
    height: SIZE,
    pixel: (x, y): Rgba8 => [x * 8, y * 8, 128, 255],
  };
  const withSmooth = (color: Partial<ColorSettings>, extra: Partial<Clip> = {}): Clip =>
    clipWith(color, { assetId: "smooth", ...extra });

  it.each<[string, Partial<Clip>]>([
    ["crop", { crop: { left: 0.25, top: 0.1, right: 0.2, bottom: 0.3 } }],
    [
      "scale up and move",
      {
        transform: {
          ...createClip({ id: "x", type: "media" }).transform,
          x: 10,
          y: 6,
          scaleX: 1.5,
          scaleY: 1.5,
        },
      },
    ],
    [
      "rotation about the centre",
      {
        transform: {
          ...createClip({ id: "x", type: "media" }).transform,
          x: 32,
          y: 32,
          anchorX: 16,
          anchorY: 16,
          rotation: 33,
        },
      },
    ],
    ["opacity and blend", { opacity: 0.6, blendMode: "multiply" }],
  ])("%s", async (_name, extra) => {
    const direct = await render(withSmooth({}, extra), 64, [smooth]);
    const processed = await render(withSmooth(tiny, extra), 64, [smooth]);
    expect(processed.diagnostics).toEqual([]);
    expect(maxChannelDiff(processed.pixels, direct.pixels)).toBeLessThanOrEqual(2);
  });

  it("a layer drawn smaller than its source is processed at the smaller size and still lines up", async () => {
    const half = {
      transform: { ...createClip({ id: "x", type: "media" }).transform, scaleX: 0.5, scaleY: 0.5 },
    };
    const direct = await render(withSmooth({}, half), 32, [smooth]);
    const processed = await render(withSmooth(tiny, half), 32, [smooth]);
    expect(maxChannelDiff(processed.pixels, direct.pixels)).toBeLessThanOrEqual(8);
  });

  it("transparent pixels stay transparent through the grade", async () => {
    const holes: TestImage = {
      id: "holes",
      width: 16,
      height: 16,
      pixel: (x): Rgba8 => (x < 8 ? [200, 100, 50, 255] : [0, 0, 0, 0]),
    };
    const clip = createClip({
      id: "c",
      type: "media",
      assetId: "holes",
      outUs: 1_000_000,
      color: { ...neutralColor(), exposure: 1 },
    });
    const result = await render(clip, 16, [holes]);
    const px = (x: number) =>
      Array.from(result.pixels.subarray((8 * 16 + x) * 4, (8 * 16 + x) * 4 + 4));
    expect(px(12)).toEqual([0, 0, 0, 255]); // the comp background, untouched by the grade
    expect(px(2)[0] ?? 0).toBeGreaterThan(200); // the opaque half got brighter
  });
});

describe("LUT files from the library", () => {
  /** A 2-point-per-axis cube that inverts every channel. */
  const INVERT = [
    "TITLE invert",
    "LUT_3D_SIZE 2",
    ...[0, 1].flatMap((b) =>
      [0, 1].flatMap((g) =>
        [0, 1].map((r) => `${String(1 - r)} ${String(1 - g)} ${String(1 - b)}`),
      ),
    ),
  ].join("\n");

  async function renderWithLut(text: string | null, lutId = "my-lut") {
    const main = createComposition({
      id: "main",
      width: SIZE,
      height: SIZE,
      tracks: [
        createTrack({
          id: "t",
          kind: "visual",
          clips: [clipWith({ lut: { lutId, intensity: 1 } })],
        }),
      ],
    });
    current = await createTestEngine(projectOf([imageAsset(palette)], [main]), [palette]);
    if (text !== null) current.resolver.addText(lutId, text);
    return current.engine.renderAt("main", 0, { readback: true });
  }

  it("loads a .cube through the resolver and applies it", async () => {
    const result = await renderWithLut(INVERT);
    expect(result.diagnostics).toEqual([]);
    const lut = parseCube(INVERT);
    // Compare against the reference with this LUT: invert in display space.
    const direct: number[] = [];
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const [r, g, b] = palette.pixel(x, y);
        const graded = gradeColor([toLinear(r / 255), toLinear(g / 255), toLinear(b / 255)], {
          settings: { ...neutralColor(), lut: { lutId: "x", intensity: 1 } },
          lut,
        });
        direct.push(
          ...graded.map((v) => Math.round(Math.min(1, Math.max(0, toSrgb(v))) * 255)),
          255,
        );
      }
    }
    expect(worst(result.pixels, direct)).toBeLessThanOrEqual(TOLERANCE);
    const first = Array.from(result.pixels.subarray(0, 3));
    const source = palette.pixel(0, 0);
    expect(first[0]).toBeCloseTo(255 - source[0], -1);
  });

  it("reports a file that isn't a valid .cube and shows the clip ungraded", async () => {
    const result = await renderWithLut("this is not a LUT");
    expect(result.diagnostics.map((d) => d.code)).toEqual(["lut_unavailable"]);
    expect(result.diagnostics[0]?.message).toMatch(/isn't a valid \.cube file/);
  });
});
