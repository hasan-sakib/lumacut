import {
  centeredTransform,
  createClip,
  createComposition,
  createTrack,
  frameToUs,
  type Clip,
  type Rational,
} from "@lumacut/schema";
import { afterEach, describe, expect, it } from "vitest";
import {
  FIXTURES,
  decodeBarcodeRgba,
  expectedBarcode,
  fixture,
  hashPixels,
} from "../src/testing/index.ts";
import { shuffled } from "./helpers.ts";
import {
  at,
  createTestEngine,
  imageAsset,
  projectOf,
  videoAsset,
  type TestEngine,
  type TestImage,
} from "./scene.ts";

let current: TestEngine | null = null;
afterEach(async () => {
  await current?.dispose();
  current = null;
});

/** One-clip composition sized like the fixture; `fps` is the composition's frame rate. */
async function videoScene(file: string, clip: Partial<Clip>, fps: Rational = fixture(file).fps) {
  const f = fixture(file);
  const main = createComposition({
    id: "main",
    width: f.width,
    height: f.height,
    fps,
    durationUs: 10_000_000,
    tracks: [
      createTrack({
        id: "v",
        kind: "visual",
        clips: [
          createClip({
            id: "c",
            type: "media",
            assetId: file,
            outUs: frameToUs(f.frames, f.fps),
            ...clip,
          }),
        ],
      }),
    ],
  });
  current = await createTestEngine(projectOf([videoAsset(file)], [main]));
  const { engine } = current;
  return {
    engine,
    /** The frame number shown by the composited output at timeline time `t`. */
    async shown(t: number): Promise<number | null> {
      const result = await engine.renderAt("main", t, { readback: true });
      return decodeBarcodeRgba(result.pixels, f.width, f.height, "top-left");
    },
  };
}

describe.each(FIXTURES.map((f) => f.file))("composited output of %s is frame-exact", (file) => {
  const f = fixture(file);
  const indices = Array.from({ length: f.frames }, (_, i) => i);

  async function wrongFrames(order: number[], offsetUs = 0): Promise<[number, number | null][]> {
    const scene = await videoScene(file, {});
    const wrong: [number, number | null][] = [];
    for (const n of order) {
      const shown = await scene.shown(frameToUs(n, f.fps) + offsetUs);
      if (shown !== expectedBarcode(f, n)) wrong.push([n, shown]);
    }
    return wrong;
  }

  it("at every frame start, playing forward", async () => {
    expect(await wrongFrames(indices)).toEqual([]);
  });

  it("at every frame start, playing backward", async () => {
    expect(await wrongFrames([...indices].reverse())).toEqual([]);
  });

  it("at every frame start, in shuffled order (seeded)", async () => {
    expect(await wrongFrames(shuffled(f.frames, 20261102))).toEqual([]);
  });

  it("just before the next frame starts (last safe instant of each frame)", async () => {
    const scene = await videoScene(file, {});
    const wrong: [number, number | null][] = [];
    for (const n of shuffled(f.frames - 1, 7)) {
      const shown = await scene.shown(frameToUs(n + 1, f.fps) - 3);
      if (shown !== expectedBarcode(f, n)) wrong.push([n, shown]);
    }
    expect(wrong).toEqual([]);
  });
});

describe("clips that remap time stay frame-exact", () => {
  const FILES = ["fx_2997.mp4", "fx_24.mp4", "fx_60.mp4"];

  it.each(FILES)("%s: trimmed in-point and a start that isn't zero", async (file) => {
    const { fps } = fixture(file);
    const [i, a, K] = [17, 11, 60];
    const scene = await videoScene(file, {
      startUs: frameToUs(a, fps),
      inUs: frameToUs(i, fps),
      outUs: frameToUs(i + K, fps),
    });
    const wrong: number[] = [];
    for (let k = 0; k < K; k += 1) {
      if ((await scene.shown(frameToUs(a + k, fps))) !== i + k) wrong.push(k);
    }
    expect(wrong).toEqual([]);
  });

  it.each(FILES)("%s: reversed", async (file) => {
    const { fps } = fixture(file);
    const [i, K] = [5, 50];
    const scene = await videoScene(file, {
      startUs: frameToUs(3, fps),
      inUs: frameToUs(i, fps),
      outUs: frameToUs(i + K, fps),
      reversed: true,
    });
    const wrong: number[] = [];
    for (let k = 0; k < K; k += 1) {
      if ((await scene.shown(frameToUs(3 + k, fps))) !== i + K - 1 - k) wrong.push(k);
    }
    expect(wrong).toEqual([]);
  });

  it.each(FILES)("%s: double speed and half speed", async (file) => {
    const { fps } = fixture(file);
    const fast = await videoScene(file, { outUs: frameToUs(80, fps), speed: 2 });
    for (let k = 0; k < 40; k += 1) expect(await fast.shown(frameToUs(k, fps))).toBe(2 * k);
    await current?.dispose();
    const slow = await videoScene(file, { outUs: frameToUs(40, fps), speed: 0.5 });
    for (let k = 0; k < 80; k += 2) expect(await slow.shown(frameToUs(k, fps))).toBe(k / 2);
  });

  it.each(FILES)("%s: a freeze frame", async (file) => {
    const { fps } = fixture(file);
    const scene = await videoScene(file, {
      outUs: frameToUs(30, fps),
      freezeAtUs: frameToUs(23, fps),
    });
    for (const k of [0, 5, 29]) expect(await scene.shown(frameToUs(k, fps))).toBe(23);
  });

  it("a 24 fps clip in a 30 fps composition (frame boundaries that don't align)", async () => {
    const fps30 = { num: 30, den: 1 };
    const scene = await videoScene("fx_24.mp4", {}, fps30);
    const wrong: [number, number | null][] = [];
    for (let k = 0; k < 120; k += 1) {
      const want = Math.floor((k * 24) / 30);
      const shown = await scene.shown(frameToUs(k, fps30));
      if (shown !== want) wrong.push([k, shown]);
    }
    expect(wrong).toEqual([]);
  });

  it("a 60 fps clip in a 30 fps composition shows every other frame", async () => {
    const fps30 = { num: 30, den: 1 };
    const scene = await videoScene("fx_60.mp4", {}, fps30);
    for (let k = 0; k < 90; k += 7) expect(await scene.shown(frameToUs(k, fps30))).toBe(2 * k);
  });
});

describe("how the engine reaches frames", () => {
  it("plays forward on one decoder", async () => {
    const scene = await videoScene("fx_30.mp4", {});
    const f = fixture("fx_30.mp4");
    for (let n = 0; n < f.frames; n += 1) await scene.shown(frameToUs(n, f.fps));
    expect(scene.engine.snapshot()).toMatchObject({
      seeks: 1,
      iteratorsOpened: 1,
      sequentialReads: f.frames - 1,
    });
  });

  it("decodes a frame once when two clips want it in the same render", async () => {
    const f = fixture("fx_30.mp4");
    const main = createComposition({
      id: "main",
      width: f.width,
      height: f.height,
      tracks: [
        createTrack({
          id: "a",
          kind: "visual",
          clips: [createClip({ id: "c1", type: "media", assetId: "fx_30.mp4", outUs: 2_000_000 })],
        }),
        createTrack({
          id: "b",
          kind: "visual",
          clips: [
            createClip({
              id: "c2",
              type: "media",
              assetId: "fx_30.mp4",
              outUs: 2_000_000,
              opacity: 0.5,
            }),
          ],
        }),
      ],
    });
    current = await createTestEngine(projectOf([videoAsset("fx_30.mp4")], [main]));
    await current.engine.renderAt("main", frameToUs(40, f.fps));
    // One decoded sample plus the VideoFrame view used for the upload; one seek, not two.
    expect(current.engine.snapshot()).toMatchObject({
      framesOpened: 2,
      framesClosed: 2,
      seeks: 1,
      textureMisses: 1,
    });
  });

  it("serves a repeated frame from the texture cache without decoding again", async () => {
    const scene = await videoScene("fx_30.mp4", {});
    await scene.shown(frameToUs(10, { num: 30, den: 1 }));
    const before = scene.engine.snapshot();
    await scene.shown(frameToUs(10, { num: 30, den: 1 }));
    const after = scene.engine.snapshot();
    expect(after.framesOpened).toBe(before.framesOpened);
    expect(after.textureHits).toBeGreaterThan(before.textureHits);
  });
});

describe("memory", () => {
  it("never leaks a frame or decoder, stays inside its texture budget, and releases everything", async () => {
    const f = fixture("fx_30.mp4");
    const frameBytes = f.width * f.height * 4;
    const budget = 6 * frameBytes;
    const main = createComposition({
      id: "main",
      width: f.width,
      height: f.height,
      tracks: [
        createTrack({
          id: "v",
          kind: "visual",
          clips: [
            createClip({
              id: "c",
              type: "media",
              assetId: "fx_30.mp4",
              outUs: frameToUs(f.frames, f.fps),
            }),
          ],
        }),
      ],
    });
    current = await createTestEngine(projectOf([videoAsset("fx_30.mp4")], [main]), [], {
      textureBudgetBytes: budget,
    });
    const { engine } = current;
    const times = [
      ...Array.from({ length: f.frames }, (_, n) => n), // a full pass forward
      ...shuffled(f.frames, 99), // then a full shuffled pass
      ...shuffled(f.frames, 100).slice(0, 60),
    ];
    for (const n of times) {
      await engine.renderAt("main", frameToUs(n, f.fps));
      const stats = engine.snapshot();
      expect(stats.openFrames, `after frame ${String(n)}`).toBe(0);
      expect(stats.textureBytes).toBeLessThanOrEqual(budget);
      expect(stats.openIterators).toBeLessThanOrEqual(6);
    }
    expect(engine.snapshot().textureEvictions).toBeGreaterThan(0);
    await current.dispose();
    const final = engine.snapshot();
    expect(final).toMatchObject({
      openFrames: 0,
      openIterators: 0,
      textureCount: 0,
      textureBytes: 0,
      targetCount: 0,
      targetBytes: 0,
    });
    expect(final.framesOpened).toBe(final.framesClosed);
    current = null;
  });
});

describe("determinism", () => {
  const logo: TestImage = {
    id: "logo",
    width: 64,
    height: 64,
    pixel: (x, y) => (x + y < 64 ? [240, 80, 20, 220] : [20, 90, 230, 140]),
  };

  function scene() {
    const f30 = fixture("fx_30.mp4");
    const pip = createComposition({
      id: "pip",
      width: 160,
      height: 90,
      fps: { num: 25, den: 1 },
      tracks: [
        createTrack({
          id: "pv",
          kind: "visual",
          clips: [
            createClip({
              id: "pc",
              type: "media",
              assetId: "fx_25.mp4",
              outUs: 4_000_000,
              transform: {
                ...createClip({ id: "t", type: "solid" }).transform,
                scaleX: 0.5,
                scaleY: 0.5,
              },
            }),
          ],
        }),
      ],
    });
    const base = createClip({ id: "t", type: "solid" }).transform;
    const main = createComposition({
      id: "main",
      width: f30.width,
      height: f30.height,
      tracks: [
        createTrack({
          id: "v1",
          kind: "visual",
          clips: [
            createClip({ id: "video", type: "media", assetId: "fx_30.mp4", outUs: 4_000_000 }),
          ],
        }),
        createTrack({
          id: "v2",
          kind: "visual",
          clips: [
            createClip({
              id: "logo",
              type: "media",
              assetId: "logo",
              outUs: 4_000_000,
              opacity: 0.8,
              blendMode: "multiply",
              transform: {
                ...centeredTransform({ width: 320, height: 180 }, logo),
                x: 200,
                y: 100,
                rotation: 20,
                scaleX: 1.5,
                scaleY: 1.5,
              },
            }),
          ],
        }),
        createTrack({
          id: "v3",
          kind: "visual",
          clips: [
            createClip({
              id: "pip",
              type: "composition",
              compositionId: "pip",
              outUs: 4_000_000,
              opacity: 0.7,
              blendMode: "screen",
              transform: { ...base, x: 250, y: 30, rotation: -8 },
            }),
          ],
        }),
      ],
    });
    return projectOf(
      [videoAsset("fx_30.mp4"), videoAsset("fx_25.mp4"), imageAsset(logo)],
      [main, pip],
    );
  }

  async function hashes(
    order: number[],
    limits?: { textureBudgetBytes: number; maxReaders: number },
  ) {
    const test = await createTestEngine(scene(), [logo], limits);
    try {
      const out = new Map<number, string>();
      for (const k of order) {
        const result = await test.engine.renderAt("main", frameToUs(k, { num: 30, den: 1 }), {
          readback: true,
        });
        out.set(k, hashPixels(result.pixels));
      }
      return out;
    } finally {
      await test.dispose();
    }
  }

  it("produces identical pixels whatever the seek history or cache pressure", async () => {
    const times = Array.from({ length: 24 }, (_, i) => i * 4);
    const forward = await hashes(times);
    expect(new Set(forward.values()).size).toBeGreaterThan(12); // the scene really changes over time
    for (const [label, order, limits] of [
      ["backward", [...times].reverse(), undefined],
      ["shuffled", shuffled(times.length, 5).map((i) => at(times, i)), undefined],
      [
        "tiny cache and one decoder",
        shuffled(times.length, 6).map((i) => at(times, i)),
        { textureBudgetBytes: 400_000, maxReaders: 1 },
      ],
    ] as const) {
      const other = await hashes([...order], limits);
      for (const k of times)
        expect(other.get(k), `${label}, frame ${String(k)}`).toBe(forward.get(k));
    }
  });

  it("renders the same frame identically every time on one engine", async () => {
    current = await createTestEngine(scene(), [logo]);
    const t = frameToUs(44, { num: 30, den: 1 });
    const first = hashPixels((await current.engine.renderAt("main", t, { readback: true })).pixels);
    for (const other of [3, 90, 17])
      await current.engine.renderAt("main", frameToUs(other, { num: 30, den: 1 }));
    const again = hashPixels((await current.engine.renderAt("main", t, { readback: true })).pixels);
    expect(again).toBe(first);
  });
});
