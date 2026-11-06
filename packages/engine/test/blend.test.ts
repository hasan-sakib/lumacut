import { BlendMode } from "@lumacut/schema";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  BLEND_MODES,
  blendModeIndex,
  blendRgb,
  compositePixel,
  type Rgb,
  type Rgba,
} from "../src/index.ts";

const grey = (v: number): Rgb => [v, v, v];
/** Blend two grey values (all three channels equal) and return one channel. */
const b = (mode: BlendMode, cb: number, cs: number): number =>
  blendRgb(mode, grey(cb), grey(cs))[0];

const lum = (c: Rgb) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
const unit = fc.double({ min: 0, max: 1, noNaN: true });
const rgb = fc.tuple(unit, unit, unit) as fc.Arbitrary<Rgb>;
const mode = fc.constantFrom(...BLEND_MODES);
/** Alpha is either exactly 0 or a realistic value; denormals are meaningless to divide by. */
const alpha = fc.oneof(fc.constant(0), fc.double({ min: 1e-3, max: 1, noNaN: true }));

function expectClose(actual: readonly number[], expected: readonly number[], digits = 9): void {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((v, i) => {
    expect(actual[i]).toBeCloseTo(v, digits);
  });
}

describe("mode catalogue", () => {
  it("covers all 24 schema modes in a stable order the shader relies on", () => {
    expect(BLEND_MODES).toHaveLength(24);
    expect(BLEND_MODES[0]).toBe("normal");
    BLEND_MODES.forEach((m, i) => {
      expect(blendModeIndex(m)).toBe(i);
    });
    expect(() => blendModeIndex("nope" as BlendMode)).toThrow(RangeError);
  });
});

describe("separable modes: known values", () => {
  it.each<[BlendMode, number, number, number]>([
    ["normal", 0.2, 0.7, 0.7],
    ["multiply", 0.5, 0.5, 0.25],
    ["screen", 0.5, 0.5, 0.75],
    ["overlay", 0.25, 0.5, 0.25],
    ["overlay", 0.75, 0.5, 0.75],
    ["darken", 0.3, 0.6, 0.3],
    ["lighten", 0.3, 0.6, 0.6],
    ["colorDodge", 0.25, 0.5, 0.5],
    ["colorDodge", 0, 0.9, 0],
    ["colorDodge", 0.4, 1, 1],
    ["colorBurn", 0.75, 0.5, 0.5],
    ["colorBurn", 1, 0, 1],
    ["colorBurn", 0.5, 0, 0],
    ["linearBurn", 0.6, 0.7, 0.3],
    ["add", 0.6, 0.7, 1],
    ["softLight", 0.5, 0.5, 0.5],
    ["softLight", 0.5, 0, 0.25],
    ["hardLight", 0.5, 0.25, 0.25],
    ["hardLight", 0.5, 0.75, 0.75],
    ["vividLight", 0.5, 0.25, 0],
    ["vividLight", 0.25, 0.75, 0.5],
    ["linearLight", 0.5, 0.75, 1],
    ["linearLight", 0.5, 0.25, 0],
    ["pinLight", 0.5, 0.25, 0.5],
    ["pinLight", 0.5, 0.1, 0.2],
    ["hardMix", 0.5, 0.5, 1],
    ["hardMix", 0.4, 0.5, 0],
    ["difference", 0.2, 0.7, 0.5],
    ["exclusion", 0.5, 0.5, 0.5],
    ["subtract", 0.7, 0.2, 0.5],
    ["subtract", 0.2, 0.7, 0],
    ["divide", 0.25, 0.5, 0.5],
    ["divide", 0.5, 0, 1],
  ])("%s(backdrop %f, source %f) = %f", (m, cb, cs, expected) => {
    expect(b(m, cb, cs)).toBeCloseTo(expected, 9);
  });
});

describe("blend properties (random colours)", () => {
  it("every mode returns an in-gamut colour", () => {
    fc.assert(
      fc.property(mode, rgb, rgb, (m, cb, cs) => {
        for (const v of blendRgb(m, cb, cs)) {
          expect(v).toBeGreaterThanOrEqual(-1e-9);
          expect(v).toBeLessThanOrEqual(1 + 1e-9);
        }
      }),
    );
  });

  it("symmetric modes don't care which layer is on top", () => {
    const symmetric: BlendMode[] = [
      "multiply",
      "screen",
      "darken",
      "lighten",
      "difference",
      "add",
      "exclusion",
    ];
    fc.assert(
      fc.property(fc.constantFrom(...symmetric), rgb, rgb, (m, x, y) => {
        const forward = blendRgb(m, x, y);
        const swapped = blendRgb(m, y, x);
        forward.forEach((v, i) => {
          expect(v).toBeCloseTo(swapped[i] ?? NaN, 9);
        });
      }),
    );
  });

  it("overlay is hardLight with the layers swapped", () => {
    fc.assert(
      fc.property(rgb, rgb, (x, y) => {
        blendRgb("overlay", x, y).forEach((v, i) => {
          expect(v).toBeCloseTo(blendRgb("hardLight", y, x)[i] ?? NaN, 9);
        });
      }),
    );
  });

  it("have the identities every editor relies on", () => {
    fc.assert(
      fc.property(rgb, (c) => {
        expectClose(blendRgb("multiply", [1, 1, 1], c), c);
        expectClose(blendRgb("multiply", [0, 0, 0], c), [0, 0, 0]);
        expectClose(blendRgb("screen", [0, 0, 0], c), c);
        expectClose(blendRgb("screen", [1, 1, 1], c), [1, 1, 1]);
        expectClose(blendRgb("difference", c, c), [0, 0, 0]);
        expectClose(blendRgb("add", [0, 0, 0], c), c);
        expectClose(blendRgb("normal", [0.3, 0.3, 0.3], c), c);
      }),
    );
  });

  it("non-separable modes take the right ingredient from each layer", () => {
    fc.assert(
      fc.property(rgb, rgb, (cb, cs) => {
        // luminosity: luminance of the source, colour of the backdrop. color: the reverse.
        expect(lum(blendRgb("luminosity", cb, cs))).toBeCloseTo(lum(cs), 6);
        expect(lum(blendRgb("color", cb, cs))).toBeCloseTo(lum(cb), 6);
        expect(lum(blendRgb("hue", cb, cs))).toBeCloseTo(lum(cb), 6);
        expect(lum(blendRgb("saturation", cb, cs))).toBeCloseTo(lum(cb), 6);
      }),
    );
  });

  it("colour mode of a grey source over a grey backdrop stays grey", () => {
    const out = blendRgb("color", grey(0.3), grey(0.8));
    expect(out[0]).toBeCloseTo(0.3, 9);
    expect(out[1]).toBeCloseTo(0.3, 9);
    expect(out[2]).toBeCloseTo(0.3, 9);
  });
});

describe("compositePixel (straight RGBA, source-over with a blend mode)", () => {
  const opaque = (r: number, g: number, bl: number): Rgba => [r, g, bl, 1];

  it("over a transparent backdrop returns the source colour for every mode", () => {
    fc.assert(
      fc.property(mode, rgb, alpha, alpha, (m, cs, as, opacity) => {
        const out = compositePixel(m, [0.9, 0.1, 0.4, 0], [...cs, as], opacity);
        if (as * opacity === 0) {
          expect(out).toEqual([0, 0, 0, 0]);
          return;
        }
        expect(out[3]).toBeCloseTo(as * opacity, 9);
        expectClose(out.slice(0, 3), cs, 6);
      }),
    );
  });

  it("leaves the backdrop untouched at zero opacity", () => {
    fc.assert(
      fc.property(mode, rgb, rgb, (m, cb, cs) => {
        const out = compositePixel(m, [...cb, 1], [...cs, 1], 0);
        cb.forEach((v, i) => {
          expect(out[i]).toBeCloseTo(v, 9);
        });
        expect(out[3]).toBe(1);
      }),
    );
  });

  it("normal: an opaque source replaces the backdrop; 50% mixes half and half", () => {
    expect(compositePixel("normal", opaque(1, 0, 0), opaque(0, 0, 1))).toEqual([0, 0, 1, 1]);
    const half = compositePixel("normal", opaque(0, 0, 0), opaque(1, 0.5, 0), 0.5);
    expect(half[0]).toBeCloseTo(0.5, 9);
    expect(half[1]).toBeCloseTo(0.25, 9);
    expect(half[3]).toBe(1);
  });

  it("blend modes fade in with opacity: multiply at 50% over white", () => {
    const out = compositePixel("multiply", opaque(1, 1, 1), opaque(0.2, 0.4, 0.6), 0.5);
    expect(out[0]).toBeCloseTo(0.6, 9);
    expect(out[1]).toBeCloseTo(0.7, 9);
    expect(out[2]).toBeCloseTo(0.8, 9);
  });

  it("combines alpha like source-over: ao = as + ab(1 - as)", () => {
    const out = compositePixel("normal", [1, 1, 1, 0.5], [0, 0, 0, 0.5]);
    expect(out[3]).toBeCloseTo(0.75, 9);
    expect(out[0]).toBeCloseTo(0.25 / 0.75, 9);
  });

  it("always returns in-gamut straight colours", () => {
    fc.assert(
      fc.property(mode, rgb, alpha, rgb, alpha, alpha, (m, cb, ab, cs, as, opacity) => {
        const out = compositePixel(m, [...cb, ab], [...cs, as], opacity);
        for (const v of out) {
          expect(v).toBeGreaterThanOrEqual(-1e-9);
          expect(v).toBeLessThanOrEqual(1 + 1e-9);
        }
      }),
    );
  });
});

describe("schema contract", () => {
  it("handles every mode the schema allows", () => {
    for (const m of BlendMode.options)
      expect(() => blendRgb(m, grey(0.5), grey(0.5))).not.toThrow();
  });
});
