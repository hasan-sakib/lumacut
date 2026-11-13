import { num } from "../p.ts";
import { dbToGain, defineAudioEffect } from "./define.ts";
import { NoiseGate } from "./gate-dsp.ts";

export const compressor = defineAudioEffect({
  id: "compressor",
  name: "Compressor",
  category: "Dynamics",
  description:
    "Even out the level: loud parts are turned down above the threshold by the ratio, then everything is brought back up with make-up gain. Makes a voice sit steadily in a mix.",
  keywords: ["compressor", "dynamics", "level", "even out", "punch", "voice", "squash"],
  params: [
    num("threshold", "Threshold", -24, -60, 0, { unit: "dB", step: 0.5 }),
    num("ratio", "Ratio", 4, 1, 20, { step: 0.1, unit: ":1" }),
    num("knee", "Knee", 6, 0, 40, { unit: "dB", step: 0.5 }),
    num("attack", "Attack", 10, 0, 1000, { unit: "ms", step: 1 }),
    num("release", "Release", 150, 1, 1000, { unit: "ms", step: 1 }),
    num("makeup", "Make-up gain", 0, -12, 24, { unit: "dB", step: 0.5 }),
  ],
  build: (context, params) => {
    const node = context.createDynamicsCompressor();
    node.threshold.value = params.num("threshold");
    node.ratio.value = params.num("ratio");
    node.knee.value = params.num("knee");
    node.attack.value = params.num("attack") / 1000;
    node.release.value = params.num("release") / 1000;
    const makeup = context.createGain();
    makeup.gain.value = dbToGain(params.num("makeup"));
    node.connect(makeup);
    return { input: node, output: makeup };
  },
});

export const limiter = defineAudioEffect({
  id: "limiter",
  name: "Limiter",
  category: "Dynamics",
  description:
    "Stop peaks going over a ceiling: a very fast, hard compressor. Drive pushes the sound into it to make it louder.",
  keywords: ["limiter", "ceiling", "peak", "clip", "loud", "maximise", "brickwall"],
  params: [
    num("drive", "Drive", 0, 0, 24, { unit: "dB", step: 0.5 }),
    num("ceiling", "Ceiling", -1, -24, 0, { unit: "dB", step: 0.1 }),
    num("release", "Release", 60, 1, 1000, { unit: "ms", step: 1 }),
  ],
  build: (context, params) => {
    const drive = context.createGain();
    drive.gain.value = dbToGain(params.num("drive"));
    const node = context.createDynamicsCompressor();
    node.threshold.value = params.num("ceiling");
    node.knee.value = 0;
    node.ratio.value = 20;
    node.attack.value = 0.001;
    node.release.value = params.num("release") / 1000;
    drive.connect(node);
    return { input: drive, output: node };
  },
});

export const noiseGate = defineAudioEffect({
  id: "noiseGate",
  name: "Noise gate",
  category: "Dynamics",
  description:
    "Silence the gaps: when the sound falls below the threshold (room noise between words, hum between notes) it is turned down by the range.",
  keywords: ["gate", "noise gate", "silence", "hiss", "hum", "background noise", "clean up"],
  params: [
    num("threshold", "Threshold", -45, -90, 0, { unit: "dB", step: 0.5 }),
    num("attack", "Attack", 2, 0.1, 100, { unit: "ms", step: 0.1 }),
    num("hold", "Hold", 60, 0, 1000, { unit: "ms", step: 1 }),
    num("release", "Release", 150, 1, 2000, { unit: "ms", step: 1 }),
    num("range", "Range", -60, -90, 0, { unit: "dB", step: 1 }),
  ],
  processor: (sampleRate, params) =>
    new NoiseGate(sampleRate, {
      thresholdDb: params.num("threshold"),
      attackMs: params.num("attack"),
      holdMs: params.num("hold"),
      releaseMs: params.num("release"),
      rangeDb: params.num("range"),
    }),
});
