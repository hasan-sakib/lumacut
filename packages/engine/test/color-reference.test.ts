import { neutralColor, type ColorSettings } from "@lumacut/schema";
import { describe, expect, it } from "vitest";
import {
  CURVE_ROWS,
  CURVE_SIZE,
  curveTable,
  lookupCurve,
  sampleCurve,
} from "../src/color/curves.ts";
import { CubeError, lookup3d, parseCube, to3d } from "../src/color/cube.ts";
import {
  exposure,
  gradeColor,
  hslToRgb,
  luma,
  rgbToHsl,
  saturationVibrance,
  tone,
  toLinear,
  toSrgb,
  whiteBalance,
  wheels,
  type Rgb,
} from "../src/color/reference.ts";
import { hasCurves, isNeutralColor } from "../src/color/settings.ts";

const near = (a: readonly number[], b: readonly number[], digits = 9): void => {
  a.forEach((v, i) => {
    expect(v).toBeCloseTo(b[i] ?? NaN, digits);
  });
};
const settings = (over: Partial<ColorSettings> = {}): ColorSettings => ({
  ...neutralColor(),
  ...over,
});
const grid: Rgb[] = [];
for (const r of [0, 0.05, 0.18, 0.5, 1])
  for (const g of [0, 0.2, 0.7, 1]) for (const b of [0, 0.1, 0.4, 0.9]) grid.push([r, g, b]);

describe("the neutral grade", () => {
  it("changes nothing", () => {
    for (const c of grid) near(gradeColor(c, { settings: settings() }), c);
  });

  it("is recognised as neutral, and so is an identity curve", () => {
    expect(isNeutralColor(neutralColor())).toBe(true);
    const identity = {
      master: [
        [0, 0],
        [1, 1],
      ] as [number, number][],
      r: [
        [0, 0],
        [1, 1],
      ] as [number, number][],
      g: [
        [0, 0],
        [0.5, 0.5],
        [1, 1],
      ] as [number, number][],
      b: [
        [0, 0],
        [1, 1],
      ] as [number, number][],
    };
    expect(isNeutralColor(settings({ curves: identity }))).toBe(true);
    expect(
      hasCurves(
        settings({
          curves: {
            ...identity,
            master: [
              [0, 0.1],
              [1, 1],
            ],
          },
        }),
      ),
    ).toBe(true);
    expect(isNeutralColor(settings({ exposure: 0.1 }))).toBe(false);
    expect(isNeutralColor(settings({ lut: { lutId: "x", intensity: 0 } }))).toBe(true);
    expect(isNeutralColor(settings({ lut: { lutId: "x", intensity: 0.5 } }))).toBe(false);
    const hsl = neutralHsl();
    expect(isNeutralColor(settings({ hsl }))).toBe(true);
    hsl.red.hue = 0.2;
    expect(isNeutralColor(settings({ hsl }))).toBe(false);
  });
});

function neutralHsl() {
  const band = () => ({ hue: 0, saturation: 0, luminance: 0 });
  return {
    red: band(),
    orange: band(),
    yellow: band(),
    green: band(),
    aqua: band(),
    blue: band(),
    purple: band(),
    magenta: band(),
  };
}

describe("grading steps", () => {
  it("exposure is a number of stops", () => {
    near(exposure([0.1, 0.2, 0.4], 1), [0.2, 0.4, 0.8]);
    near(exposure([0.1, 0.2, 0.4], -2), [0.025, 0.05, 0.1]);
  });

  it("warm temperature raises red and lowers blue; magenta tint lowers green", () => {
    const warm = whiteBalance([0.5, 0.5, 0.5], 100, 0);
    expect(warm[0]).toBeGreaterThan(0.5);
    expect(warm[2]).toBeLessThan(0.5);
    expect(warm[1]).toBe(0.5);
    expect(whiteBalance([0.5, 0.5, 0.5], 0, 100)[1]).toBeLessThan(0.5);
    near(whiteBalance([0.2, 0.3, 0.4], 0, 0), [0.2, 0.3, 0.4]);
  });

  it("contrast pivots on mid-grey and steepens the rest", () => {
    near(tone([0.18, 0.18, 0.18], 0.5, 0, 0, 0, 0), [0.18, 0.18, 0.18]);
    const up = tone([0.36, 0.36, 0.36], 0.5, 0, 0, 0, 0)[0];
    expect(up).toBeGreaterThan(0.36);
    const down = tone([0.05, 0.05, 0.05], 0.5, 0, 0, 0, 0)[0];
    expect(down).toBeLessThan(0.05);
    expect(tone([0.36, 0.36, 0.36], -0.5, 0, 0, 0, 0)[0]).toBeLessThan(0.36);
  });

  it("highlights, shadows, whites and blacks move their own tonal region", () => {
    const base = (v: number): Rgb => [v, v, v];
    const dark = 0.01;
    const bright = 0.9;
    expect(tone(base(dark), 0, 0, 1, 0, 0)[0]).toBeGreaterThan(dark * 1.5); // shadows lift darks
    expect(tone(base(bright), 0, 0, 1, 0, 0)[0]).toBeCloseTo(bright, 2); // …and leave brights
    expect(tone(base(bright), 0, -1, 0, 0, 0)[0]).toBeLessThan(bright * 0.7); // highlights recover
    expect(tone(base(dark), 0, -1, 0, 0, 0)[0]).toBeCloseTo(dark, 3);
    expect(tone(base(0), 0, 0, 0, 0, 1)[0]).toBeGreaterThan(0.03); // blacks lift pure black
    expect(tone(base(bright), 0, 0, 0, 1, 0)[0]).toBeGreaterThan(bright);
  });

  it("wheels: gain scales, offset shifts, lift lifts shadows, gamma bends mid-tones", () => {
    const zero: Rgb = [0, 0, 0];
    near(wheels([0.5, 0.5, 0.5], zero, zero, [1, 0, -0.5], zero), [1, 0.5, 0.25]);
    near(wheels([0.5, 0.5, 0.5], zero, zero, zero, [1, 0, 0]), [0.6, 0.5, 0.5]);
    const lifted = wheels([0, 0.9, 0.5], [1, 1, 1], zero, zero, zero);
    expect(lifted[0]).toBeCloseTo(0.1, 9); // black gets the full lift
    expect(lifted[1]).toBeCloseTo(0.9 + 0.1 * 0.1, 9); // white barely moves
    expect(wheels([0.25, 0.25, 0.25], zero, [1, 0, -0.5], zero, zero)[0]).toBeCloseTo(
      0.25 ** 0.5,
      9,
    );
    expect(wheels([0.25, 0.25, 0.25], zero, [1, 0, -0.5], zero, zero)[1]).toBe(0.25);
    expect(wheels([0.25, 0.25, 0.25], zero, [1, 0, -0.5], zero, zero)[2]).toBeCloseTo(0.25 ** 2, 9);
  });

  it("saturation 0 → grey keeps luma; -1 removes colour; vibrance helps dull colours more", () => {
    const c: Rgb = [0.6, 0.3, 0.1];
    const grey = saturationVibrance(c, -1, 0);
    near(grey, [luma(c), luma(c), luma(c)]);
    const dull: Rgb = [0.3, 0.28, 0.26];
    const vivid: Rgb = [0.9, 0.05, 0.02];
    const gainOf = (v: Rgb) => {
      const out = saturationVibrance(v, 0, 1);
      return (Math.max(...out) - Math.min(...out)) / (Math.max(...v) - Math.min(...v));
    };
    expect(gainOf(dull)).toBeGreaterThan(gainOf(vivid));
    near(saturationVibrance(c, 0, 0), c);
  });

  it("the HSL conversions round-trip", () => {
    for (const c of [
      [0.2, 0.5, 0.8],
      [1, 0, 0],
      [0.3, 0.3, 0.3],
      [0, 1, 0.5],
    ] as Rgb[]) {
      near(hslToRgb(rgbToHsl(c)), c, 6);
    }
    near(rgbToHsl([1, 0, 0]), [0, 1, 0.5]);
    near(rgbToHsl([0, 0, 1]), [2 / 3, 1, 0.5]);
  });

  it("the sRGB transfer pair inverts", () => {
    for (const v of [0, 0.001, 0.04, 0.5, 1]) expect(toLinear(toSrgb(v))).toBeCloseTo(v, 9);
  });
});

describe("curves and bands in the full grade", () => {
  const withCurves = (curves: NonNullable<ColorSettings["curves"]>) => {
    const s = settings({ curves });
    return { settings: s, curves: curveTable(curves) };
  };
  const diag: [number, number][] = [
    [0, 0],
    [1, 1],
  ];

  it("a master curve darkens when its midpoint is pulled down", () => {
    const params = withCurves({
      master: [
        [0, 0],
        [0.5, 0.3],
        [1, 1],
      ],
      r: diag,
      g: diag,
      b: diag,
    });
    const out = gradeColor([0.2158, 0.2158, 0.2158], params); // sRGB 0.5
    expect(out[0]).toBeLessThan(0.2158);
    near(gradeColor([0, 0, 0], params), [0, 0, 0]);
    near(gradeColor([1, 1, 1], params), [1, 1, 1], 6);
  });

  it("a red-channel curve changes only red", () => {
    const params = withCurves({
      master: diag,
      r: [
        [0, 0],
        [0.5, 0.7],
        [1, 1],
      ],
      g: diag,
      b: diag,
    });
    const c: Rgb = [0.2158, 0.2158, 0.2158];
    const out = gradeColor(c, params);
    expect(out[0]).toBeGreaterThan(c[0]);
    expect(out[1]).toBeCloseTo(c[1], 6);
    expect(out[2]).toBeCloseTo(c[2], 6);
  });

  it("hue-vs-sat above the line boosts that hue only", () => {
    const flat: [number, number][] = [
      [0, 0.5],
      [1, 0.5],
    ];
    const redBoost: [number, number][] = [
      [0, 1],
      [0.1, 0.5],
      [0.9, 0.5],
      [1, 1],
    ];
    const params = withCurves({
      master: diag,
      r: diag,
      g: diag,
      b: diag,
      hueVsSat: redBoost,
      hueVsHue: flat,
    });
    const red: Rgb = [0.5, 0.1, 0.1];
    const blue: Rgb = [0.1, 0.1, 0.5];
    const chroma = (c: Rgb) => Math.max(...c) - Math.min(...c);
    expect(chroma(gradeColor(red, params))).toBeGreaterThan(chroma(red) * 1.2);
    expect(chroma(gradeColor(blue, params))).toBeCloseTo(chroma(blue), 3);
  });

  it("an HSL band moves only colours near its hue", () => {
    const hsl = neutralHsl();
    hsl.red.saturation = -1;
    const params = { settings: settings({ hsl }) };
    const red: Rgb = [0.6, 0.1, 0.1];
    const blue: Rgb = [0.1, 0.1, 0.6];
    const chroma = (c: Rgb) => Math.max(...c) - Math.min(...c);
    expect(chroma(gradeColor(red, params))).toBeLessThan(chroma(red) * 0.2);
    expect(chroma(gradeColor(blue, params))).toBeCloseTo(chroma(blue), 3);
    // Greys are untouched whatever the bands say.
    near(gradeColor([0.4, 0.4, 0.4], params), [0.4, 0.4, 0.4], 6);
  });
});

describe("curve sampling", () => {
  it("is exact through the control points and monotone between them", () => {
    const table = sampleCurve([
      [0, 0],
      [0.25, 0.1],
      [0.75, 0.9],
      [1, 1],
    ]);
    expect(table.length).toBe(CURVE_SIZE);
    expect(table[0]).toBe(0);
    expect(table[CURVE_SIZE - 1]).toBe(1);
    expect(lookupCurve(table, 0, 0.25)).toBeCloseTo(0.1, 2);
    expect(lookupCurve(table, 0, 0.75)).toBeCloseTo(0.9, 2);
    let last = -1;
    for (const v of table) {
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }
  });

  it("never overshoots, even with a sharp kink", () => {
    const table = sampleCurve([
      [0, 0],
      [0.5, 0.05],
      [0.55, 0.95],
      [1, 1],
    ]);
    for (const v of table) {
      expect(v).toBeGreaterThanOrEqual(-1e-6);
      expect(v).toBeLessThanOrEqual(1 + 1e-6);
    }
  });

  it("holds the ends, copes with one point, unsorted points and repeated x", () => {
    const held = sampleCurve([
      [0.2, 0.3],
      [0.8, 0.6],
    ]);
    expect(held[0]).toBeCloseTo(0.3, 6);
    expect(held[CURVE_SIZE - 1]).toBeCloseTo(0.6, 6);
    expect(sampleCurve([[0.5, 0.4]])[10]).toBeCloseTo(0.4, 6);
    expect(
      sampleCurve([
        [1, 1],
        [0, 0],
      ])[128],
    ).toBeCloseTo(128 / 255, 3);
    expect(
      sampleCurve([
        [0, 0],
        [0.5, 0.2],
        [0.5, 0.6],
        [1, 1],
      ])[128],
    ).toBeGreaterThan(0.4);
    expect(sampleCurve([])[5]).toBe(0);
  });

  it("packs the seven rows, defaulting to identity and flat", () => {
    const table = curveTable(undefined);
    expect(table.length).toBe(CURVE_SIZE * CURVE_ROWS.length);
    expect(lookupCurve(table, 0, 0.3)).toBeCloseTo(0.3, 3);
    expect(lookupCurve(table, 4, 0.3)).toBeCloseTo(0.5, 6);
    expect(lookupCurve(table, 0, -1)).toBe(0);
    expect(lookupCurve(table, 0, 2)).toBe(1);
  });
});

const IDENTITY_CUBE = (n: number): string => {
  const rows: string[] = [`TITLE "identity"`, `LUT_3D_SIZE ${String(n)}`];
  for (let b = 0; b < n; b++)
    for (let g = 0; g < n; g++)
      for (let r = 0; r < n; r++)
        rows.push(`${String(r / (n - 1))} ${String(g / (n - 1))} ${String(b / (n - 1))}`);
  return rows.join("\n");
};

describe(".cube parsing", () => {
  it("reads a 3D table with comments, a title and the domain", () => {
    const lut = parseCube(
      `# made by hand\n${IDENTITY_CUBE(2)}\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\n`,
    );
    expect(lut).toMatchObject({ title: "identity", dimension: 3, size: 2 });
    expect(lut.data.length).toBe(2 * 2 * 2 * 3);
  });

  it("an identity LUT looks up its input", () => {
    const lut = parseCube(IDENTITY_CUBE(5));
    for (const c of [
      [0.1, 0.5, 0.9],
      [0, 0, 0],
      [1, 1, 1],
      [0.33, 0.66, 0.2],
    ] as Rgb[]) {
      near(lookup3d(lut, c), c, 6);
    }
  });

  it("a 1D table becomes a cube whose channels use their own curve", () => {
    const lut = parseCube(`LUT_1D_SIZE 3\n0 0 1\n0.5 0.25 0.5\n1 1 0\n`);
    const cube = to3d(lut, 9);
    expect(cube.dimension).toBe(3);
    const [r, g, b] = lookup3d(cube, [0.5, 0.5, 0.5]);
    expect(r).toBeCloseTo(0.5, 6);
    expect(g).toBeCloseTo(0.25, 6);
    expect(b).toBeCloseTo(0.5, 6);
    expect(to3d(parseCube(IDENTITY_CUBE(2)))).toBeDefined();
  });

  it("applies the domain", () => {
    const lut = parseCube(
      `LUT_3D_SIZE 2\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 2 2 2\n${IDENTITY_CUBE(2).split("\n").slice(2).join("\n")}`,
    );
    near(lookup3d(lut, [1, 0, 2]), [0.5, 0, 1], 6);
  });

  it("reports problems with a line number instead of guessing", () => {
    const bad = (text: string, message: RegExp) => {
      expect(() => parseCube(text)).toThrow(CubeError);
      expect(() => parseCube(text)).toThrow(message);
    };
    bad("", /no LUT_1D_SIZE or LUT_3D_SIZE/);
    bad("LUT_3D_SIZE 2\n0 0 0\n", /Expected 8 table rows/);
    bad("LUT_3D_SIZE 1\n", /from 2 to 65/);
    bad("LUT_3D_SIZE 2.5\n", /whole number/);
    bad("LUT_3D_SIZE 2\nLUT_1D_SIZE 4\n", /one table/);
    bad("LUT_3D_SIZE 2\nFOO 1\n", /unknown keyword "FOO"/);
    bad("LUT_1D_SIZE 2\n0 0\n1 1 1\n", /Line 2: A table row needs 3 numbers/);
    bad("LUT_1D_SIZE 2\n0 0 x\n1 1 1\n", /Line 2: "x" isn't a number/);
    bad(
      "LUT_1D_SIZE 2\nDOMAIN_MIN 1 1 1\nDOMAIN_MAX 0 0 0\n0 0 0\n1 1 1\n",
      /DOMAIN_MAX must be larger/,
    );
    bad("LUT_1D_SIZE 2\nDOMAIN_MIN 1 1\n", /DOMAIN_MIN needs 3 numbers/);
  });

  it("accepts Windows line endings and a byte-order mark", () => {
    const lut = parseCube(`\uFEFF${IDENTITY_CUBE(2).replace(/\n/g, "\r\n")}`);
    expect(lut.size).toBe(2);
  });
});
