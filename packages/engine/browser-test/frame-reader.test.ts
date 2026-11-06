import { afterEach, describe, expect, it } from "vitest";
import { FrameReader, MediaError, type MediaResolver } from "../src/index.ts";
import { FIXTURES, expectedBarcode, fixture } from "../src/testing/index.ts";
import { barcodeOfFrame, makeHarness, shuffled, type GlHarness } from "./helpers.ts";

let harness: GlHarness | null = null;

afterEach(async () => {
  await harness?.dispose();
  harness = null;
});

async function readerFor(file: string) {
  harness = makeHarness();
  const entry = fixture(file);
  const media = await harness.registry.video(file);
  return { entry, media, reader: new FrameReader(media, entry.fps, harness.stats), h: harness };
}

/** Reads `order` and returns [index, barcode shown] pairs that disagree with the manifest. */
async function mismatches(file: string, order: number[]): Promise<[number, number | null][]> {
  const { entry, reader, h } = await readerFor(file);
  const wrong: [number, number | null][] = [];
  for (const n of order) {
    const frame = await reader.frame(n);
    const shown = barcodeOfFrame(h.gl, frame);
    frame.close();
    if (shown !== expectedBarcode(entry, n)) wrong.push([n, shown]);
  }
  await reader.close();
  h.stats.assertQuiescent();
  return wrong;
}

describe.each(FIXTURES.map((f) => f.file))("frame-exact decode of %s", (file) => {
  const frames = fixture(file).frames;
  const indices = Array.from({ length: frames }, (_, i) => i);

  it("returns every frame exactly, playing forward", async () => {
    expect(await mismatches(file, indices)).toEqual([]);
  });

  it("returns every frame exactly, playing backward", async () => {
    expect(await mismatches(file, [...indices].reverse())).toEqual([]);
  });

  it("returns every frame exactly, in shuffled order (seeded)", async () => {
    expect(await mismatches(file, shuffled(frames, 20261102))).toEqual([]);
  });
});

describe("negative control: the check can actually fail", () => {
  it("sees the VFR fixture's repeated frames when told to expect a perfect sequence", async () => {
    const entry = fixture("fx_vfr.mp4");
    const { reader, h } = await readerFor("fx_vfr.mp4");
    const shown: (number | null)[] = [];
    for (let n = 0; n < entry.frames; n += 1) {
      const frame = await reader.frame(n);
      shown.push(barcodeOfFrame(h.gl, frame));
      frame.close();
    }
    await reader.close();
    const wrongAgainstIdentity = shown.filter((value, n) => value !== n).length;
    expect(wrongAgainstIdentity).toBe(17); // the 17 gap-filling duplicates in the manifest
    expect(shown).toEqual(entry.barcodes);
  });
});

describe("how the reader reaches frames", () => {
  it("plays forward on a single decoder iterator after the first seek", async () => {
    const { entry, reader, h } = await readerFor("fx_30.mp4");
    for (let n = 0; n < entry.frames; n += 1) (await reader.frame(n)).close();
    const stats = h.stats.snapshot();
    expect(stats).toMatchObject({
      seeks: 1,
      iteratorsOpened: 1,
      sequentialReads: entry.frames - 1,
      skippedFrames: 0,
    });
    expect(reader.hasOpenIterator).toBe(true);
    await reader.close();
    expect(reader.hasOpenIterator).toBe(false);
    h.stats.assertQuiescent();
  });

  it("decodes through small forward gaps but seeks over big jumps", async () => {
    const { reader, h } = await readerFor("fx_30.mp4");
    for (const n of [0, 1, 2, 5, 9]) (await reader.frame(n)).close();
    expect(h.stats.snapshot()).toMatchObject({ seeks: 1, iteratorsOpened: 1, skippedFrames: 5 });
    (await reader.frame(80)).close(); // far ahead: close the iterator, seek
    expect(h.stats.snapshot()).toMatchObject({ seeks: 2, iteratorsClosed: 1 });
    await reader.close();
    h.stats.assertQuiescent();
  });

  it("seeks for every frame when playing backward (reverse and scrubbing)", async () => {
    const { entry, reader, h } = await readerFor("fx_24.mp4");
    for (let n = entry.frames - 1; n >= 0; n -= 1) (await reader.frame(n)).close();
    expect(h.stats.snapshot()).toMatchObject({ seeks: entry.frames, iteratorsOpened: 0 });
    h.stats.assertQuiescent();
  });

  it("reaches the last frame of a long-GOP file with a single keyframe", async () => {
    const { entry, reader, h } = await readerFor("fx_long_gop.mp4");
    const last = await reader.frame(entry.frames - 1);
    expect(barcodeOfFrame(h.gl, last)).toBe(entry.frames - 1);
    last.close();
    await reader.close();
  });

  it("never leaks a frame, even when a request fails", async () => {
    const { entry, reader, h } = await readerFor("fx_30.mp4");
    await expect(reader.frame(entry.frames + 40)).rejects.toBeInstanceOf(MediaError);
    h.stats.assertQuiescent();
    (await reader.frame(3)).close(); // still usable afterwards
    h.stats.assertQuiescent();
  });

  it("refuses to use a frame after it was closed, and closing twice is harmless", async () => {
    const { reader, h } = await readerFor("fx_30.mp4");
    const frame = await reader.frame(0);
    frame.close();
    frame.close();
    expect(frame.closed).toBe(true);
    expect(() => frame.withVideoFrame(() => 1)).toThrow(/already closed/);
    expect(h.stats.openFrames).toBe(0);
  });
});

describe("MediaRegistry", () => {
  it("opens an asset once however many readers use it", async () => {
    let calls = 0;
    const resolver: MediaResolver = {
      resolve: (assetId) => {
        calls += 1;
        return import("../src/testing/index.ts").then((m) => m.fixtureUrl(assetId));
      },
    };
    harness = makeHarness({ resolver });
    const [a, b, c] = await Promise.all([
      harness.registry.video("fx_30.mp4"),
      harness.registry.video("fx_30.mp4"),
      harness.registry.video("fx_30.mp4"),
    ]);
    expect(calls).toBe(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(a).toMatchObject({ width: 320, height: 180 });
    expect(Math.abs(a.firstTimestamp)).toBeLessThan(0.1);
  });

  it("does not cache a failed open, so a retry can succeed", async () => {
    let attempt = 0;
    const resolver: MediaResolver = {
      resolve: async (assetId) => {
        attempt += 1;
        const { fixtureUrl } = await import("../src/testing/index.ts");
        return attempt === 1 ? "/definitely-not-here.mp4" : fixtureUrl(assetId);
      },
    };
    harness = makeHarness({ resolver });
    await expect(harness.registry.video("fx_30.mp4")).rejects.toBeInstanceOf(MediaError);
    await expect(harness.registry.video("fx_30.mp4")).resolves.toMatchObject({ width: 320 });
  });

  it("explains what went wrong when the asset can't be opened", async () => {
    harness = makeHarness({ resolver: { resolve: () => Promise.resolve("/nope.mp4") } });
    await expect(harness.registry.video("ghost")).rejects.toThrow(/Asset ghost: /);
  });

  it("invalidate() makes the next request reopen the asset", async () => {
    harness = makeHarness();
    const first = await harness.registry.video("fx_30.mp4");
    await harness.registry.invalidate("fx_30.mp4");
    const second = await harness.registry.video("fx_30.mp4");
    expect(second).not.toBe(first);
  });
});
