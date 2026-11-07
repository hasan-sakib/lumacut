import { createClip } from "@lumacut/schema";
import { describe, expect, it } from "vitest";
import { filmstripTiles, sourceTimeAt, type ThumbIndex } from "./filmstrip.ts";
import { peaksPerSecond, waveformSlice, type WaveformJson } from "./waveform.ts";

const SEC = 1_000_000;
const clip = (extra: Partial<ReturnType<typeof createClip>> = {}) =>
  createClip({
    id: "c",
    type: "media",
    assetId: "v",
    startUs: 0,
    inUs: 0,
    outUs: 4 * SEC,
    ...extra,
  });

// 1 s between tiles, 4 columns x 2 rows per sheet, 10 tiles (so a second, short sheet), 80x45 tiles
const index: ThumbIndex = {
  intervalUs: SEC,
  tileWidth: 80,
  tileHeight: 45,
  columns: 4,
  rows: 2,
  count: 10,
};

describe("sourceTimeAt", () => {
  it("follows in point and speed, mirrors for reversed, holds for freeze, and stays inside the clip", () => {
    expect(sourceTimeAt(clip({ inUs: 2 * SEC, outUs: 6 * SEC }), 1 * SEC)).toBe(3 * SEC);
    expect(sourceTimeAt(clip({ speed: 2 }), 1 * SEC)).toBe(2 * SEC);
    expect(sourceTimeAt(clip({ reversed: true }), 1 * SEC)).toBe(3 * SEC);
    expect(sourceTimeAt(clip({ freezeAtUs: SEC }), 3 * SEC)).toBe(SEC);
    expect(sourceTimeAt(clip(), 99 * SEC)).toBe(4 * SEC - 1);
    expect(sourceTimeAt(clip({ inUs: SEC, outUs: 4 * SEC }), -5 * SEC)).toBe(SEC);
  });
});

describe("filmstripTiles", () => {
  it("covers the clip with tiles of the thumbnail's aspect, picking frames by source time", () => {
    const tiles = filmstripTiles(clip(), index, 400, 45);
    expect(tiles).toHaveLength(5); // 400 px / 80 px
    expect(tiles.map((t) => t.left)).toEqual([0, 80, 160, 240, 320]);
    expect(tiles[0]?.width).toBe(80);
    // clip 4 s over 400 px: tile centres at 40, 120, 200, 280, 360 px = 0.4, 1.2, 2.0, 2.8, 3.6 s
    expect(tiles.map((t) => t.col + t.row * 4)).toEqual([0, 1, 2, 2, 3]);
  });

  it("a trimmed, sped-up clip reads from the right part of the media", () => {
    const tiles = filmstripTiles(clip({ inUs: 4 * SEC, outUs: 8 * SEC, speed: 2 }), index, 200, 45);
    // 2 s on screen over 200 px, source 4..8 s at 2x: centres at 40, 120 and 200 px = 0.4, 1.2, 2.0 s = source 4.8, 6.4, 8.0 s (clamped to 7.99)
    expect(tiles.map((t) => t.sheet * 8 + t.col + t.row * 4)).toEqual([4, 6, 7]);
  });

  it("a reversed clip starts from its out point", () => {
    const tiles = filmstripTiles(clip({ reversed: true }), index, 400, 45);
    // centres at 0.4, 1.2, 2.0, 2.8, 3.6 s from the start = source 3.6, 2.8, 2.0, 1.2, 0.4 s
    expect(tiles.map((t) => t.col + t.row * 4)).toEqual([3, 2, 2, 1, 0]);
  });

  it("uses the second sheet, with its short row count, for late tiles", () => {
    const t = filmstripTiles(clip({ inUs: 8 * SEC, outUs: 10 * SEC }), index, 160, 45);
    expect(t.every((tile) => tile.sheet === 1)).toBe(true);
    expect(t[0]).toMatchObject({ col: 0, row: 0, rowsInSheet: 1 }); // 2 tiles left on sheet 1: one row
  });

  it("limits work to the visible window and handles degenerate input", () => {
    const tiles = filmstripTiles(clip(), index, 4000, 45, { fromPx: 800, toPx: 1000 });
    expect(tiles.map((t) => t.left)).toEqual([800, 880, 960]);
    expect(filmstripTiles(clip(), index, 0, 45)).toEqual([]);
    expect(filmstripTiles(clip(), { ...index, count: 0 }, 400, 45)).toEqual([]);
  });
});

// 100 peaks per second, mono; values are min/max pairs in -127..127
function wave(peaks: number[]): WaveformJson {
  return { channels: 1, length: peaks.length, data: peaks.flatMap((p) => [-p, p]) };
}

describe("waveformSlice", () => {
  it("reads the part of the source the clip plays", () => {
    const w = wave(Array.from({ length: 400 }, (_, i) => (i < 200 ? 10 : 127)));
    const quiet = waveformSlice(clip({ inUs: 0, outUs: 2 * SEC }), w, 4);
    const loud = waveformSlice(clip({ inUs: 2 * SEC, outUs: 4 * SEC }), w, 4);
    expect(quiet.every((v) => v < 0.1)).toBe(true);
    expect(loud.every((v) => v === 1)).toBe(true);
  });

  it("a reversed clip shows the waveform mirrored", () => {
    const w = wave(Array.from({ length: 400 }, (_, i) => (i < 200 ? 10 : 127)));
    const forward = waveformSlice(clip(), w, 4);
    const reversed = waveformSlice(clip({ reversed: true }), w, 4);
    expect(reversed).toEqual([...forward].reverse());
    expect(forward[0]).toBeLessThan(forward[3] ?? 0);
  });

  it("uses the file's own rate when it has one, and copes with empty or short data", () => {
    expect(peaksPerSecond({ ...wave([1]), sample_rate: 48_000, samples_per_pixel: 960 })).toBe(50);
    expect(peaksPerSecond(wave([1]))).toBe(100);
    expect(waveformSlice(clip(), wave([]), 3)).toEqual([0, 0, 0]);
    expect(waveformSlice(clip(), wave([127]), 0)).toEqual([]);
    expect(waveformSlice(clip({ inUs: 50 * SEC, outUs: 51 * SEC }), wave([127, 127]), 2)).toEqual([
      0, 0,
    ]); // past the end
  });
});
