import { describe, expect, it } from "vitest";
import {
  histogram,
  lumaOf,
  parade,
  vectorscope,
  vectorscopeTarget,
  waveform,
  type ScopeSample,
} from "../src/scopes/index.ts";

/** A sample whose pixel (x, y) is `pixel(x, y)`. */
function sample(
  width: number,
  height: number,
  pixel: (x: number, y: number) => [number, number, number],
): ScopeSample {
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      pixels.set([...pixel(x, y), 255], (y * width + x) * 4);
    }
  }
  return { width, height, pixels };
}

describe("histogram", () => {
  it("counts every pixel once per channel", () => {
    const h = histogram(sample(4, 2, (x) => [x * 10, 0, 255]));
    expect(h.r.reduce((a, b) => a + b, 0)).toBe(8);
    expect(h.r[10]).toBe(2);
    expect(h.g[0]).toBe(8);
    expect(h.b[255]).toBe(8);
    expect(h.max).toBe(8);
  });

  it("puts grey on the same bin in every channel and in luma", () => {
    const h = histogram(sample(2, 2, () => [100, 100, 100]));
    expect(h.r[100]).toBe(4);
    expect(h.luma[100]).toBe(4);
  });
});

describe("waveform", () => {
  it("draws a horizontal ramp as a diagonal: column x holds level x", () => {
    const w = waveform(
      sample(256, 4, (x) => [x, x, x]),
      "luma",
    );
    expect(w.width).toBe(256);
    expect(w.height).toBe(256);
    for (const x of [0, 100, 255]) {
      // Row 0 is the top (level 255), so level x is row 255 − x.
      expect(w.counts[(255 - x) * 256 + x]).toBe(4);
    }
    expect(w.max).toBe(4);
  });

  it("folds columns together when the output is narrower", () => {
    const w = waveform(
      sample(8, 1, () => [50, 0, 0]),
      "r",
      2,
    );
    expect(w.counts[(255 - 50) * 2]).toBe(4);
    expect(w.counts[(255 - 50) * 2 + 1]).toBe(4);
  });

  it("a narrow sample still fills a wider output continuously", () => {
    const w = waveform(
      sample(4, 1, () => [90, 90, 90]),
      "luma",
      16,
    );
    for (let column = 0; column < 16; column++) {
      expect(w.counts[(255 - 90) * 16 + column]).toBe(1);
    }
  });

  it("reads the channel asked for", () => {
    const s = sample(2, 1, () => [10, 200, 30]);
    expect(waveform(s, "g").counts[(255 - 200) * 2]).toBe(1);
    expect(waveform(s, "b").counts[(255 - 30) * 2]).toBe(1);
    expect(waveform(s, "r").counts[(255 - 10) * 2]).toBe(1);
  });
});

describe("parade", () => {
  it("is three waveforms a third of the width each", () => {
    const p = parade(
      sample(30, 2, () => [255, 0, 128]),
      30,
    );
    expect([p.r.width, p.g.width, p.b.width]).toEqual([10, 10, 10]);
    expect(p.r.counts[0]).toBeGreaterThan(0); // red at the top row
    expect(p.g.counts[255 * 10]).toBeGreaterThan(0); // green at the bottom row
  });
});

describe("vectorscope", () => {
  it("puts neutral colours in the centre whatever their brightness", () => {
    const v = vectorscope(
      sample(4, 4, (x, y) => {
        const g = (x + y * 4) * 16;
        return [g, g, g];
      }),
      65,
    );
    const centre = 32 * 65 + 32;
    expect(v.counts[centre]).toBe(16);
  });

  it("puts red above centre and blue to the right", () => {
    const red = vectorscope(
      sample(2, 2, () => [255, 0, 0]),
      65,
    );
    const blue = vectorscope(
      sample(2, 2, () => [0, 0, 255]),
      65,
    );
    const where = (v: { counts: Uint32Array; size: number }) => {
      const at = v.counts.findIndex((c) => c > 0);
      return { x: at % v.size, y: Math.floor(at / v.size) };
    };
    expect(where(red).y).toBeLessThan(32);
    expect(where(blue).x).toBeGreaterThan(32);
  });

  it("targets match where pure colours land", () => {
    const t = vectorscopeTarget(255, 0, 0);
    expect(t.y).toBeLessThan(0.5);
    const scope = vectorscope(
      sample(1, 1, () => [255, 0, 0]),
      101,
    );
    const at = scope.counts.findIndex((c) => c > 0);
    expect(at % 101).toBe(Math.round(t.x * 100));
    expect(Math.floor(at / 101)).toBe(Math.round(t.y * 100));
  });

  it("Rec. 709 luma weights", () => {
    expect(lumaOf(255, 255, 255)).toBeCloseTo(255, 6);
    expect(lumaOf(0, 255, 0)).toBeCloseTo(182.376, 3);
  });
});
