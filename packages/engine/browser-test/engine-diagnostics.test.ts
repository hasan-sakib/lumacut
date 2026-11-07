import {
  createClip,
  createComposition,
  createTrack,
  type Asset,
  type Clip,
  type ClipType,
} from "@lumacut/schema";
import { afterEach, describe, expect, it } from "vitest";
import { Engine, type MediaResolver, type ReadbackRenderResult } from "../src/index.ts";
import { pixelAt } from "../src/testing/index.ts";
import {
  SceneResolver,
  must,
  createTestEngine,
  imageAsset,
  projectOf,
  solidImage,
  videoAsset,
  type Rgba8,
  type TestEngine,
  type TestImage,
} from "./scene.ts";

let current: TestEngine | null = null;
afterEach(async () => {
  await current?.dispose();
  current = null;
});

const RED: Rgba8 = [255, 0, 0, 255];
const red = solidImage("red", 32, 32, RED);

const media = (id: string, assetId: string, over: Partial<Clip> = {}): Clip =>
  createClip({ id, type: "media", assetId, ...over });

async function render(clips: Clip[], images: TestImage[] = [red], extraAssets: Asset[] = []) {
  const main = createComposition({
    id: "main",
    width: 32,
    height: 32,
    tracks: clips.map((clip, i) =>
      createTrack({ id: `t${String(i)}`, kind: "visual", clips: [clip] }),
    ),
  });
  current = await createTestEngine(
    projectOf([...images.map(imageAsset), ...extraAssets], [main]),
    images,
  );
  const result = await current.engine.renderAt("main", 0, { readback: true });
  return { result, codes: result.diagnostics.map((d) => `${d.clipId ?? "-"}:${d.code}`).sort() };
}

const pixel = (result: ReadbackRenderResult) => pixelAt(result.pixels, 32, 16, 16);

describe("clips the engine can't draw yet", () => {
  it.each<ClipType>(["text", "shape", "solid", "adjustment", "caption", "paint"])(
    "reports %s clips instead of dropping them silently, and still draws the rest",
    async (type) => {
      const { result, codes } = await render([media("base", "red"), createClip({ id: "x", type })]);
      expect(codes).toEqual(["x:unsupported_clip_type"]);
      expect(result.diagnostics[0]).toMatchObject({ level: "warning", clipId: "x" });
      expect(pixel(result)[0]).toBeGreaterThan(250);
    },
  );
});

describe("clip features the engine doesn't apply yet", () => {
  it("names each ignored feature", async () => {
    const busy = media("busy", "red", {
      keyframes: {
        // Not an animatable property (masks are M5): this one is reported.
        "masks.m1.feather": [{ tUs: 0, value: 1, interpolation: "linear" }],
      },
      masks: [
        {
          kind: "path",
          id: "m1",
          mode: "add",
          feather: 0,
          expansion: 0,
          opacity: 1,
          inverted: false,
          path: { closed: true, vertices: [] },
        },
      ],
      trackMatte: { sourceClipId: "other", mode: "alpha" },
      color: { ...createClip({ id: "c", type: "media" }).color, exposure: 1 },
      effects: [{ id: "fx", effectId: "gaussianBlur", enabled: true, params: {} }],
      motionBlur: { enabled: true, shutterAngle: 180, samples: 16 },
      transitionIn: {
        id: "tr",
        transitionId: "crossDissolve",
        durationUs: 500_000,
        alignment: "center",
        params: {},
      },
    });
    const { codes } = await render([busy]);
    expect(codes).toEqual(
      [
        "busy:ignored_keyframes",
        "busy:ignored_masks",
        "busy:ignored_track_matte",
        "busy:ignored_effects",
        "busy:ignored_motion_blur",
        "busy:ignored_transition",
      ].sort(),
    );
  });

  it("stays quiet for a plain clip and for disabled effects", async () => {
    const plain = media("plain", "red", {
      effects: [{ id: "fx", effectId: "gaussianBlur", enabled: false, params: {} }],
    });
    expect((await render([plain])).codes).toEqual([]);
  });
});

describe("media problems", () => {
  it("reports a clip with no asset, an unknown asset and an asset of the wrong kind", async () => {
    const audio: Asset = {
      id: "song",
      kind: "audio",
      name: "song",
      mimeType: "audio/wav",
      sizeBytes: 1,
      source: "user",
    };
    const { codes } = await render(
      [
        createClip({ id: "none", type: "media" }),
        media("ghost", "nope"),
        media("song-clip", "song"),
        media("ok", "red"),
      ],
      [red],
      [audio],
    );
    expect(codes).toEqual([
      "ghost:missing_asset",
      "none:missing_asset",
      "song-clip:wrong_asset_kind",
    ]);
  });

  it("keeps rendering when one media file can't be opened", async () => {
    const broken = videoAsset("fx_30.mp4");
    const scene = await SceneResolver.create([red]);
    const resolver: MediaResolver = {
      resolve: (assetId, kind) =>
        assetId === "fx_30.mp4"
          ? Promise.resolve("/definitely-missing.mp4")
          : scene.resolve(assetId, kind),
    };
    const canvas = new OffscreenCanvas(1, 1);
    const engine = Engine.create({ canvas, resolver });
    try {
      engine.setProject(
        projectOf(
          [imageAsset(red), broken],
          [
            createComposition({
              id: "main",
              width: 32,
              height: 32,
              tracks: [
                createTrack({ id: "a", kind: "visual", clips: [media("bad", "fx_30.mp4")] }),
                createTrack({ id: "b", kind: "visual", clips: [media("good", "red")] }),
              ],
            }),
          ],
        ),
      );
      const result = await engine.renderAt("main", 0, { readback: true });
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({ clipId: "bad", code: "media_error", level: "error" }),
      );
      expect(result.diagnostics.find((d) => d.code === "media_error")?.message).toMatch(
        /Asset fx_30\.mp4: couldn't open/,
      );
      expect(pixel(result)[0]).toBeGreaterThan(250);
      expect(engine.snapshot().openFrames).toBe(0);
    } finally {
      await engine.dispose();
      scene.dispose();
    }
  });

  it("refuses an image larger than the GPU's texture limit, saying why", async () => {
    const probe = await createTestEngine(
      projectOf([], [createComposition({ id: "main", width: 8, height: 8 })]),
    );
    const limit = probe.engine.caps.maxTextureSize;
    await probe.dispose();
    const huge: TestImage = { id: "huge", width: limit + 1, height: 1, pixel: () => RED };
    const { result } = await render([media("big", "huge")], [huge]);
    const diagnostic = result.diagnostics.find((d) => d.code === "media_error");
    expect(diagnostic?.message).toContain(`${String(limit)} px texture limit`);
  });
});

describe("using the engine correctly", () => {
  it("says what is wrong when it can't render", async () => {
    const canvas = new OffscreenCanvas(1, 1);
    const engine = Engine.create({ canvas, resolver: await SceneResolver.create([]) });
    await expect(engine.renderAt("main", 0)).rejects.toThrow("No project loaded");
    engine.setProject(projectOf([], [createComposition({ id: "main", width: 8, height: 8 })]));
    await expect(engine.renderAt("missing", 0)).rejects.toThrow('Unknown composition "missing"');
    await engine.dispose();
    await expect(engine.renderAt("main", 0)).rejects.toThrow("disposed");
    await engine.dispose(); // disposing twice is harmless
  });

  it("runs concurrent render requests one at a time, in order", async () => {
    const { result } = await render([media("m", "red")]);
    expect(result.width).toBe(32);
    const engine = must(current, "a running test engine").engine;
    const times = [5_000, 1_000, 9_000, 0, 3_000];
    const results = await Promise.all(times.map((t) => engine.renderAt("main", t)));
    expect(results.map((r) => r.tUs)).toEqual(times);
    expect(engine.snapshot().rendersCompleted).toBe(1 + times.length);
  });

  it("resizes the canvas to each composition", async () => {
    current = await createTestEngine(
      projectOf(
        [imageAsset(red)],
        [
          createComposition({ id: "small", width: 16, height: 8 }),
          createComposition({ id: "wide", width: 48, height: 12 }),
        ],
      ),
      [red],
    );
    await current.engine.renderAt("small", 0);
    expect([current.canvas.width, current.canvas.height]).toEqual([16, 8]);
    await current.engine.renderAt("wide", 0);
    expect([current.canvas.width, current.canvas.height]).toEqual([48, 12]);
  });

  it("times a render with the injected clock, never the wall clock", async () => {
    const ticks = [100, 107.5];
    const canvas = new OffscreenCanvas(1, 1);
    const engine = Engine.create({
      canvas,
      resolver: await SceneResolver.create([]),
      clock: { nowMs: () => ticks.shift() ?? 0 },
    });
    engine.setProject(projectOf([], [createComposition({ id: "main", width: 8, height: 8 })]));
    expect((await engine.renderAt("main", 0)).renderMs).toBe(7.5);
    await engine.dispose();
  });
});
