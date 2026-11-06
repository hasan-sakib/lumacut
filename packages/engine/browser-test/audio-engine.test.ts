import { createClip, createComposition, createTrack, type Asset, type Clip } from "@lumacut/schema";
import { afterEach, describe, expect, it } from "vitest";
import { AudioEngine } from "../src/index.ts";
import { projectOf, SceneResolver, videoAsset } from "./scene.ts";

const SAMPLE_RATE = 48000;
const FILE = "fx_30.mp4"; // 4 s, a 1 kHz beep (50 ms) starting at 0, 1, 2 and 3 s

const engines: AudioEngine[] = [];
afterEach(async () => {
  for (const engine of engines.splice(0)) await engine.dispose();
});

const audioClip = (id: string, over: Partial<Clip> = {}): Clip =>
  createClip({ id, type: "media", assetId: FILE, outUs: 4_000_000, ...over });

interface TrackSpec {
  clips: Clip[];
  muted?: boolean;
  solo?: boolean;
}

interface Rendered {
  left: Float32Array;
  right: Float32Array;
  engine: AudioEngine;
}

async function render(
  tracks: TrackSpec[],
  options: { fromUs?: number; seconds?: number; assets?: Asset[] } = {},
): Promise<Rendered> {
  const { fromUs = 0, seconds = 5, assets = [videoAsset(FILE)] } = options;
  const main = createComposition({
    id: "main",
    width: 320,
    height: 180,
    tracks: tracks.map((t, i) =>
      createTrack({
        id: `a${String(i)}`,
        kind: "audio",
        muted: t.muted ?? false,
        solo: t.solo ?? false,
        clips: t.clips,
      }),
    ),
  });
  const context = new OfflineAudioContext(2, Math.ceil(seconds * SAMPLE_RATE), SAMPLE_RATE);
  const engine = new AudioEngine({ context, resolver: await SceneResolver.create([]) });
  engines.push(engine);
  engine.setProject(projectOf(assets, [main]));
  await engine.start("main", fromUs, 0);
  await engine.scheduleUntil(fromUs + seconds * 1_000_000);
  const buffer = await context.startRendering();
  return { left: buffer.getChannelData(0), right: buffer.getChannelData(1), engine };
}

/** Start time (s) of each burst of sound: the first sample above the threshold after silence. */
function onsets(channel: Float32Array, threshold = 0.1, quietS = 0.2): number[] {
  const found: number[] = [];
  let lastLoud = -Infinity;
  for (let i = 0; i < channel.length; i += 1) {
    if (Math.abs(channel[i] ?? 0) < threshold) continue;
    if (i - lastLoud > quietS * SAMPLE_RATE) found.push(i / SAMPLE_RATE);
    lastLoud = i;
  }
  return found;
}

const peak = (channel: Float32Array, from = 0, to = channel.length): number => {
  let max = 0;
  for (let i = from; i < to; i += 1) max = Math.max(max, Math.abs(channel[i] ?? 0));
  return max;
};

function expectOnsets(actual: number[], expected: number[], toleranceMs = 2): void {
  expect(actual.length, `onsets ${actual.map((t) => t.toFixed(4)).join(", ")}`).toBe(
    expected.length,
  );
  expected.forEach((want, i) => {
    expect(
      Math.abs((actual[i] ?? Infinity) - want) * 1000,
      `onset ${String(i)} at ${String(want)} s`,
    ).toBeLessThanOrEqual(toleranceMs);
  });
}

describe("audio schedule (rendered offline)", () => {
  it("puts every beep on its whole second", async () => {
    const { left } = await render([{ clips: [audioClip("c")] }]);
    expectOnsets(onsets(left), [0, 1, 2, 3]);
  });

  it("shifts the whole clip by its start time", async () => {
    const { left } = await render([{ clips: [audioClip("c", { startUs: 1_500_000 })] }], {
      seconds: 6,
    });
    expectOnsets(onsets(left), [1.5, 2.5, 3.5, 4.5]);
  });

  it("plays only the trimmed part, from the in-point to the out-point", async () => {
    // Source seconds [1, 3): beeps at 1 and 2 land at timeline 0 and 1; the beep at 3 is cut.
    const { left } = await render([
      { clips: [audioClip("c", { inUs: 1_000_000, outUs: 3_000_000 })] },
    ]);
    expectOnsets(onsets(left), [0, 1]);
    expect(peak(left, Math.floor(2.1 * SAMPLE_RATE))).toBeLessThan(1e-4);
  });

  it("starts in the middle of a clip at the right place", async () => {
    // Playback begins 2.5 s into the timeline: only the beep at 3 s is still to come, 0.5 s in.
    const { left } = await render([{ clips: [audioClip("c")] }], { fromUs: 2_500_000, seconds: 2 });
    expectOnsets(onsets(left), [0.5]);
  });

  it("starts in the middle of a beep without replaying it from the start", async () => {
    // 2.02 s is 20 ms into the beep that began at 2.0 s: 30 ms of it remains, then silence.
    const { left } = await render([{ clips: [audioClip("c")] }], {
      fromUs: 2_020_000,
      seconds: 1.5,
    });
    expect(peak(left, 0, Math.floor(0.02 * SAMPLE_RATE))).toBeGreaterThan(0.1);
    expect(peak(left, Math.floor(0.06 * SAMPLE_RATE), Math.floor(0.9 * SAMPLE_RATE))).toBeLessThan(
      0.01,
    );
    expectOnsets(onsets(left, 0.1, 0.2).slice(1), [0.98]);
  });

  it("skips clips that finished before playback starts", async () => {
    const { left, engine } = await render([{ clips: [audioClip("old", { outUs: 1_000_000 })] }], {
      fromUs: 3_000_000,
      seconds: 1,
    });
    expect(peak(left)).toBeLessThan(1e-4);
    expect(engine.stats.sourcesScheduled).toBe(0);
  });
});

describe("mixing", () => {
  it("applies clip volume", async () => {
    const full = peak((await render([{ clips: [audioClip("c")] }], { seconds: 1 })).left);
    const half = peak(
      (
        await render(
          [
            {
              clips: [
                audioClip("c", {
                  audio: { volume: 0.5, pan: 0, fadeInUs: 0, fadeOutUs: 0, effects: [] },
                }),
              ],
            },
          ],
          { seconds: 1 },
        )
      ).left,
    );
    expect(half / full).toBeCloseTo(0.5, 1);
  });

  it("applies pan: hard left leaves the right channel silent", async () => {
    const audio = (pan: number) => ({ volume: 1, pan, fadeInUs: 0, fadeOutUs: 0, effects: [] });
    const centre = await render([{ clips: [audioClip("c", { audio: audio(0) })] }], { seconds: 1 });
    const left = await render([{ clips: [audioClip("c", { audio: audio(-1) })] }], { seconds: 1 });
    const right = await render([{ clips: [audioClip("c", { audio: audio(1) })] }], { seconds: 1 });
    expect(peak(left.right)).toBeLessThan(0.001);
    expect(peak(right.left)).toBeLessThan(0.001);
    expect(peak(left.left)).toBeGreaterThan(peak(centre.left)); // equal-power pan folds both channels into one
    expect(peak(right.right)).toBeGreaterThan(peak(centre.right));
  });

  it("adds overlapping clips together", async () => {
    const one = peak((await render([{ clips: [audioClip("a")] }], { seconds: 1 })).left);
    const two = peak(
      (await render([{ clips: [audioClip("a"), audioClip("b")] }], { seconds: 1 })).left,
    );
    expect(two / one).toBeCloseTo(2, 1);
  });

  it("silences muted tracks", async () => {
    const { left, engine } = await render([{ clips: [audioClip("c")], muted: true }]);
    expect(peak(left)).toBeLessThan(1e-4);
    expect(engine.stats.sourcesScheduled).toBe(0);
  });

  it("with a soloed track, plays only soloed tracks; a muted track stays muted even when soloed", async () => {
    const early = audioClip("early"); // beeps at 0, 1, 2, 3
    const late = audioClip("late", { startUs: 500_000 }); // beeps at 0.5, 1.5, 2.5, 3.5
    const soloEarly = await render([{ clips: [early], solo: true }, { clips: [late] }], {
      seconds: 4.5,
    });
    expectOnsets(onsets(soloEarly.left), [0, 1, 2, 3]);
    const soloLate = await render([{ clips: [early] }, { clips: [late], solo: true }], {
      seconds: 4.5,
    });
    expectOnsets(onsets(soloLate.left), [0.5, 1.5, 2.5, 3.5]);
    const mutedSolo = await render(
      [{ clips: [early], solo: true, muted: true }, { clips: [late] }],
      { seconds: 4.5 },
    );
    expect(peak(mutedSolo.left)).toBeLessThan(1e-4); // muted wins; the other track is not soloed
  });
});

describe("what the audio engine reports instead of ignoring", () => {
  it("explains clips it can't play", async () => {
    const silent: Asset = { ...videoAsset(FILE), id: "mute-video" };
    delete (silent as { audio?: unknown }).audio;
    const { left, engine } = await render(
      [
        {
          clips: [
            audioClip("fast", { speed: 2 }),
            audioClip("backwards", { reversed: true }),
            audioClip("frozen", { freezeAtUs: 1_000_000 }),
            audioClip("silent-asset", { assetId: "mute-video" }),
            audioClip("ghost", { assetId: "nope" }),
            createClip({ id: "text", type: "text" }),
            audioClip("faded", {
              audio: {
                volume: 1,
                pan: 0,
                fadeInUs: 500_000,
                fadeOutUs: 0,
                effects: [{ id: "e", effectId: "eq", enabled: true, params: {} }],
              },
            }),
          ],
        },
      ],
      { assets: [videoAsset(FILE), silent], seconds: 1 },
    );
    const codes = engine.diagnostics.map((d) => `${d.clipId ?? "-"}:${d.code}`).sort();
    expect(codes).toEqual(
      [
        "fast:audio_speed_unsupported",
        "backwards:audio_reverse_unsupported",
        "frozen:audio_freeze_silent",
        "silent-asset:no_audio_stream",
        "ghost:missing_asset",
        "text:not_audio",
        "faded:ignored_audio_fades",
        "faded:ignored_audio_effects",
      ].sort(),
    );
    expect(peak(left)).toBeGreaterThan(0.1); // the faded clip still plays (fades are ignored, not fatal)
  });
});

describe("lifecycle", () => {
  it("releases every decoder and node when stopped, and can restart elsewhere", async () => {
    const context = new OfflineAudioContext(2, SAMPLE_RATE, SAMPLE_RATE);
    const engine = new AudioEngine({ context, resolver: await SceneResolver.create([]) });
    engines.push(engine);
    engine.setProject(
      projectOf(
        [videoAsset(FILE)],
        [
          createComposition({
            id: "main",
            width: 320,
            height: 180,
            tracks: [createTrack({ id: "a", kind: "audio", clips: [audioClip("c")] })],
          }),
        ],
      ),
    );
    await engine.start("main", 0, 0);
    expect(engine.stats.iteratorsOpened).toBe(1);
    expect(engine.stats.sourcesActive).toBeGreaterThan(0);
    await engine.stop();
    expect(engine.stats).toMatchObject({
      iteratorsOpened: 1,
      iteratorsClosed: 1,
      sourcesActive: 0,
    });
    await engine.scheduleUntil(3_000_000); // nothing is playing: must schedule nothing
    expect(engine.stats.sourcesActive).toBe(0);

    await engine.start("main", 2_500_000, 0); // a seek is just stop + start elsewhere
    expect(engine.stats.iteratorsOpened).toBe(2);
    await engine.stop();
    expect(engine.stats.iteratorsClosed).toBe(2);
  });

  it("rejects an unknown composition with a clear message", async () => {
    const context = new OfflineAudioContext(2, 100, SAMPLE_RATE);
    const engine = new AudioEngine({ context, resolver: await SceneResolver.create([]) });
    engines.push(engine);
    engine.setProject(projectOf([], [createComposition({ id: "main", width: 8, height: 8 })]));
    await expect(engine.start("nope", 0, 0)).rejects.toThrow('Unknown composition "nope"');
  });
});
