import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BARCODE_CELLS,
  FIXTURES,
  barcodeStripHeight,
  decodeBarcodeRgba,
  decodeBarcodeRow,
  encodeBarcodeRow,
  expectedBarcode,
  fixture,
  hashPixels,
  maxChannelDiff,
  pixelAt,
  ssim,
} from "../src/testing/index.ts";
import vectors from "./barcode-vectors.json";

const FIXTURE_DIR = join(import.meta.dirname, "..", "fixtures");

describe("barcode (shared contract with the Python encoder)", () => {
  it("computes the same strip heights as Python", () => {
    for (const [height, expected] of Object.entries(vectors.stripHeights)) {
      expect(barcodeStripHeight(Number(height)), `height ${height}`).toBe(expected);
    }
  });

  it("encodes byte-for-byte what the Python encoder produces", () => {
    for (const { frame, width, runs } of vectors.rows) {
      const row = encodeBarcodeRow(frame, width);
      const rebuilt = new Uint8Array(width);
      for (const [start, end, value] of runs as [number, number, number][]) {
        rebuilt.fill(value, start, end);
      }
      expect(row, `frame ${String(frame)} width ${String(width)}`).toEqual(rebuilt);
    }
  });

  it("decodes every encoded frame number back", () => {
    for (const width of [180, 288, 320, 1280]) {
      for (const frame of [0, 1, 2, 3, 255, 256, 1000, 12345, 43690, 65535]) {
        const row = encodeBarcodeRow(frame, width);
        expect(decodeBarcodeRow(width, (x) => row[x] ?? 0)).toBe(frame);
      }
    }
  });

  it("rejects rows without the start/end markers", () => {
    expect(decodeBarcodeRow(320, () => 0)).toBeNull();
    expect(decodeBarcodeRow(320, () => 255)).toBeNull();
    expect(() => encodeBarcodeRow(65536, 320)).toThrow(RangeError);
  });

  it("finds the strip in RGBA pixels for both row orders", () => {
    const [width, height] = [320, 180];
    const strip = barcodeStripHeight(height);
    const rgba = new Uint8Array(width * height * 4);
    const row = encodeBarcodeRow(4321, width);
    for (let y = height - strip; y < height; y += 1) {
      for (let x = 0; x < width; x += 1)
        rgba.fill(row[x] ?? 0, (y * width + x) * 4, (y * width + x) * 4 + 3);
    }
    expect(decodeBarcodeRgba(rgba, width, height, "top-left")).toBe(4321);
    const flipped = new Uint8Array(rgba.length);
    for (let y = 0; y < height; y += 1) {
      flipped.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), (height - 1 - y) * width * 4);
    }
    expect(decodeBarcodeRgba(flipped, width, height, "bottom-left")).toBe(4321);
    expect(BARCODE_CELLS).toBe(18);
  });
});

describe("ssim", () => {
  const size = 32;
  const gradient = (offset = 0) => {
    const data = new Uint8Array(size * size * 4);
    for (let i = 0; i < size * size; i += 1) {
      const v = Math.min(255, ((i % size) * 8 + offset) | 0);
      data.set([v, v, v, 255], i * 4);
    }
    return data;
  };

  it("is 1 for identical images and symmetric", () => {
    const a = gradient();
    const b = gradient(20);
    expect(ssim(a, a, size, size)).toBeCloseTo(1, 12);
    expect(ssim(a, b, size, size)).toBeCloseTo(ssim(b, a, size, size), 12);
  });

  it("drops as images diverge", () => {
    const a = gradient();
    const noisy = Uint8Array.from(a, (v, i) => (i % 4 === 3 ? v : (v + ((i * 37) % 90)) & 255));
    const near = gradient(2);
    expect(ssim(a, near, size, size)).toBeGreaterThan(0.95);
    expect(ssim(a, noisy, size, size)).toBeLessThan(0.8);
  });

  it("matches the closed form for two flat images", () => {
    const flat = (v: number) => new Uint8Array(size * size * 4).fill(v);
    const [ma, mb] = [100, 140];
    const c1 = (0.01 * 255) ** 2;
    expect(ssim(flat(ma), flat(mb), size, size)).toBeCloseTo(
      (2 * ma * mb + c1) / (ma * ma + mb * mb + c1),
      9,
    );
  });

  it("refuses images smaller than one window", () => {
    expect(() => ssim(new Uint8Array(16), new Uint8Array(16), 2, 2)).toThrow(RangeError);
  });
});

describe("pixel helpers", () => {
  it("hash changes with content and order; diff and pixel lookup behave", () => {
    const a = Uint8Array.from([1, 2, 3, 4]);
    expect(hashPixels(a)).toBe(hashPixels(Uint8Array.from([1, 2, 3, 4])));
    expect(hashPixels(a)).not.toBe(hashPixels(Uint8Array.from([4, 3, 2, 1])));
    expect(hashPixels(a)).not.toBe(hashPixels(Uint8Array.from([1, 2, 3, 5])));
    expect(maxChannelDiff(a, Uint8Array.from([1, 9, 3, 4]))).toBe(7);
    expect(() => maxChannelDiff(a, new Uint8Array(3))).toThrow(RangeError);
    expect(pixelAt(Uint8Array.from([0, 0, 0, 0, 9, 8, 7, 6]), 2, 1, 0)).toEqual([9, 8, 7, 6]);
  });
});

describe("committed fixtures", () => {
  it("match the manifest hashes, and nothing else lives in the folder", () => {
    const onDisk = readdirSync(FIXTURE_DIR)
      .filter((f) => f !== "manifest.json")
      .sort();
    expect(onDisk).toEqual(FIXTURES.map((f) => f.file).sort());
    for (const entry of FIXTURES) {
      const bytes = readFileSync(join(FIXTURE_DIR, entry.file));
      expect(createHash("sha256").update(bytes).digest("hex"), entry.file).toBe(entry.sha256);
      expect(bytes.length).toBe(entry.bytes);
    }
  });

  it("stay small enough to live in git", () => {
    const total = FIXTURES.reduce((sum, f) => sum + statSync(join(FIXTURE_DIR, f.file)).size, 0);
    expect(total).toBeLessThan(2 * 1024 * 1024);
  });

  it("describe a CFR timeline and an honest barcode sequence", () => {
    for (const f of FIXTURES) {
      expect(f.frames, f.file).toBeGreaterThan(50);
      expect(f.fps.num / f.fps.den, f.file).toBeGreaterThanOrEqual(24);
      for (let n = 0; n < f.frames; n += 1) {
        const want = expectedBarcode(f, n);
        expect(want, `${f.file} frame ${String(n)}`).toBeGreaterThanOrEqual(0);
        expect(want).toBeLessThanOrEqual(n);
      }
    }
    expect(fixture("fx_2997.mp4").fps).toEqual({ num: 30000, den: 1001 });
    expect(() => fixture("nope.mp4")).toThrow(/Unknown fixture/);
  });

  it("include a VFR-origin file whose barcode sequence repeats frames, and a one-keyframe file", () => {
    const vfr = fixture("fx_vfr.mp4");
    expect(vfr.barcodes).not.toBe("identity");
    expect(new Set(vfr.barcodes as number[]).size).toBeLessThan(vfr.frames);
    expect(fixture("fx_long_gop.mp4")).toMatchObject({ via: "direct", gop: 120 });
  });
});
