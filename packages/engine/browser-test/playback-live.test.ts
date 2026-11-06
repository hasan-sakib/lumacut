import { createClip, createComposition, createTrack, frameToUs, usToFrame } from "@lumacut/schema";
import { afterEach, describe, expect, it } from "vitest";
import {
  AudioEngine,
  Engine,
  EngineFramePort,
  PlaybackController,
  SAMPLE_BIAS_US,
  audioContextClock,
  createPlaybackContext,
  type RenderingEngine,
} from "../src/index.ts";
import { decodeBarcodeRgba, fixture } from "../src/testing/index.ts";
import { SceneResolver, at, projectOf, videoAsset } from "./scene.ts";

const FILE = "fx_30.mp4"; // 4 s, barcode frame numbers, a beep every second
const f = fixture(FILE);
const CLIP_US = frameToUs(f.frames, f.fps);
const REPEATS = 3;
const DURATION_US = REPEATS * CLIP_US;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Record {
  requestedUs: number;
  /** Playhead (audio clock) when the frame finished rendering. */
  clockUs: number;
  wallMs: number;
  barcode: number | null;
}

function project() {
  const clips = (prefix: string) =>
    Array.from({ length: REPEATS }, (_, i) =>
      createClip({
        id: `${prefix}${String(i)}`,
        type: "media",
        assetId: FILE,
        startUs: i * CLIP_US,
        outUs: CLIP_US,
      }),
    );
  return projectOf(
    [videoAsset(FILE)],
    [
      createComposition({
        id: "main",
        width: f.width,
        height: f.height,
        durationUs: DURATION_US,
        tracks: [
          createTrack({ id: "v", kind: "visual", clips: clips("v") }),
          createTrack({ id: "a", kind: "audio", clips: clips("a") }),
        ],
      }),
    ],
  );
}

/** The frame number the picture must show at timeline time t (three back-to-back copies of the clip). */
const expectedBarcode = (t: number): number => usToFrame((t % CLIP_US) + SAMPLE_BIAS_US, f.fps);

interface Rig {
  controller: PlaybackController;
  engine: Engine;
  audio: AudioEngine;
  port: EngineFramePort;
  records: Record[];
  context: AudioContext;
  dispose: () => Promise<void>;
}

async function makeRig(): Promise<Rig> {
  const resolver = await SceneResolver.create([]);
  const engine = Engine.create({ canvas: new OffscreenCanvas(1, 1), resolver });
  engine.setProject(project());
  const context = createPlaybackContext();
  await context.resume();
  const audio = new AudioEngine({ context, resolver });
  audio.setProject(project());
  const records: Record[] = [];
  // The engine, wrapped so scheduled frames also read their pixels back for inspection.
  const reading = {
    renderAt: (compositionId: string, tUs: number) =>
      engine.renderAt(compositionId, tUs, { readback: true }),
  } as unknown as RenderingEngine;
  // The frame port needs the controller's clock and the controller needs the port: tie the knot here.
  const playhead: { controller: PlaybackController | null } = { controller: null };
  const port = new EngineFramePort(reading, {
    onPresented: (_comp, tUs, result) => {
      records.push({
        requestedUs: tUs,
        clockUs: playhead.controller?.timeUs ?? 0,
        wallMs: performance.now(),
        barcode:
          result.pixels === undefined
            ? null
            : decodeBarcodeRgba(result.pixels, result.width, result.height, "top-left"),
      });
    },
  });
  const controller = new PlaybackController({
    compositionId: "main",
    durationUs: DURATION_US,
    frames: port,
    audio,
    clock: audioContextClock(context),
  });
  playhead.controller = controller;
  return {
    controller,
    engine,
    audio,
    port,
    records,
    context,
    dispose: async () => {
      controller.dispose();
      await port.flush();
      await audio.dispose();
      await engine.dispose();
      await context.close();
    },
  };
}

let rig: Rig | null = null;
afterEach(async () => {
  await rig?.dispose();
  rig = null;
});

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return at(sorted, Math.min(sorted.length - 1, Math.floor(sorted.length * p)));
}

describe("live playback", () => {
  it("keeps the picture on the audio clock, frame-exact, across clip changes and a seek", async () => {
    rig = await makeRig();
    const { controller, records, audio, engine, port } = rig;
    const SEEK_US = 9_500_000;

    await controller.play();
    await sleep(3000);
    const seekWall = performance.now();
    await controller.seek(SEEK_US);
    await sleep(2500);
    controller.pause();
    await port.flush();
    await audio.stop();

    expect(records.length).toBeGreaterThan(60);
    expect(port.scheduler.stats.rendered / port.scheduler.stats.requested).toBeGreaterThan(0.5);

    // 1. Every picture is the right frame for the clock time it was requested at.
    const wrong = records.filter((r) => r.barcode !== expectedBarcode(r.requestedUs));
    expect(wrong.slice(0, 5)).toEqual([]);

    // 2. Before the seek time only moves forward; after it nothing older is ever shown again.
    const before = records.filter((r) => r.wallMs < seekWall);
    const after = records.filter((r) => r.wallMs >= seekWall && r.requestedUs >= SEEK_US);
    const stale = records.filter((r) => r.wallMs >= seekWall + 50 && r.requestedUs < SEEK_US);
    expect(stale).toEqual([]);
    expect(before.map((r) => r.requestedUs)).toEqual(
      [...before.map((r) => r.requestedUs)].sort((a, b) => a - b),
    );
    expect(after.length).toBeGreaterThan(30);
    expect(before.at(-1)?.requestedUs ?? 0).toBeGreaterThan(2_000_000); // it really played ~3 s
    expect(after.at(-1)?.requestedUs ?? 0).toBeGreaterThan(SEEK_US + 1_500_000); // and ~2.5 s more

    // 3. The picture is current: how far the clock moved while a frame rendered stays small.
    const startWall = at(records, 0).wallMs;
    const steady = records.filter(
      (r) => Math.abs(r.wallMs - seekWall) > 400 && r.wallMs > startWall + 300,
    );
    const lags = steady.map((r) => r.clockUs - r.requestedUs);
    expect(Math.min(...lags)).toBeGreaterThanOrEqual(0);
    expect(percentile(lags, 0.95)).toBeLessThanOrEqual(40_000);

    // 4. The audio clock runs at real time (no drift against the wall clock).
    // (the playhead is frozen until the first sound is audible, so measure from when it moves)
    const running = before.filter((r) => r.clockUs > 0);
    expect(running.length).toBeGreaterThan(60);
    const first = at(running, 5);
    const last = at(running, running.length - 1);
    const rate = (last.clockUs - first.clockUs) / 1000 / (last.wallMs - first.wallMs);
    expect(rate).toBeGreaterThan(0.97);
    expect(rate).toBeLessThan(1.03);

    // 5. Sound was scheduled, and everything is released again.
    expect(audio.stats.sourcesScheduled).toBeGreaterThan(5);
    expect(audio.stats).toMatchObject({ sourcesActive: 0 });
    expect(audio.stats.iteratorsOpened).toBe(audio.stats.iteratorsClosed);
    expect(engine.snapshot().openFrames).toBe(0);
  }, 60_000);

  it("stops by itself at the end of the timeline and can play again from the start", async () => {
    rig = await makeRig();
    const { controller, audio } = rig;
    await controller.seek(DURATION_US - 400_000);
    await controller.play();
    await sleep(1200);
    expect(controller.playing).toBe(false);
    expect(controller.timeUs).toBe(DURATION_US);
    await audio.stop();
    expect(audio.stats.sourcesActive).toBe(0);

    await controller.play(); // at the end: starts over
    await sleep(500);
    expect(controller.playing).toBe(true);
    expect(controller.timeUs).toBeLessThan(1_000_000);
  }, 30_000);

  it("reports no problems for a plain video + audio project", async () => {
    rig = await makeRig();
    await rig.controller.play();
    await sleep(500);
    rig.controller.pause();
    await rig.port.flush();
    expect(rig.audio.diagnostics).toEqual([]);
  }, 30_000);
});
