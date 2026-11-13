import { num, percent } from "../p.ts";
import { defineAudioEffect, dryWet, seededRandom } from "./define.ts";

/**
 * A room's echo as an impulse response: decaying noise (seeded, so every render is identical),
 * slightly different per channel for width, darker as it decays.
 */
function impulse(context: BaseAudioContext, seconds: number, damping: number): AudioBuffer {
  const rate = context.sampleRate;
  const length = Math.max(1, Math.round(seconds * rate));
  const buffer = context.createBuffer(2, length, rate);
  for (let c = 0; c < 2; c += 1) {
    const data = buffer.getChannelData(c);
    const rand = seededRandom(0x5eed + c * 7919 + Math.round(seconds * 1000));
    let smooth = 0;
    for (let i = 0; i < length; i += 1) {
      const t = i / length;
      const noise = rand() * 2 - 1;
      // More damping: a one-pole low-pass that closes as the tail decays.
      const k = Math.min(0.98, damping * t);
      smooth = smooth * k + noise * (1 - k);
      data[i] = smooth * (1 - t) ** 3;
    }
  }
  return buffer;
}

export const reverb = defineAudioEffect({
  id: "reverb",
  name: "Reverb",
  category: "Space",
  description:
    "Put the sound in a room: from a small booth to a large hall. Size sets how long the echo lasts, damping how dark it gets.",
  keywords: ["reverb", "room", "hall", "echo", "space", "ambience", "wet"],
  params: [
    num("size", "Size", 1.8, 0.2, 8, { unit: "s", step: 0.1 }),
    percent("damping", "Damping", 0.5),
    num("preDelay", "Pre-delay", 20, 0, 200, { unit: "ms", step: 1 }),
    percent("mix", "Mix", 0.25),
  ],
  build: (context, params) => {
    const pre = context.createDelay(1);
    pre.delayTime.value = params.num("preDelay") / 1000;
    const convolver = context.createConvolver();
    convolver.buffer = impulse(context, params.num("size"), params.num("damping"));
    pre.connect(convolver);
    return dryWet(context, pre, convolver, params.num("mix"));
  },
  tail: (params) => params.num("size") + params.num("preDelay") / 1000,
});

export const delay = defineAudioEffect({
  id: "delay",
  name: "Delay",
  category: "Space",
  description:
    "Repeat the sound after a time, each repeat quieter (feedback) and darker (tone). From a short slap-back to long echoes.",
  keywords: ["delay", "echo", "repeat", "slapback", "ping"],
  params: [
    num("time", "Time", 350, 1, 2000, { unit: "ms", step: 1 }),
    percent("feedback", "Feedback", 0.35, 0, 0.95),
    num("tone", "Tone", 6000, 500, 20000, { unit: "Hz", step: 10 }),
    percent("mix", "Mix", 0.3),
  ],
  build: (context, params) => {
    const line = context.createDelay(2.5);
    line.delayTime.value = params.num("time") / 1000;
    const feedback = context.createGain();
    feedback.gain.value = params.num("feedback");
    const tone = context.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = Math.min(params.num("tone"), context.sampleRate / 2 - 1);
    line.connect(tone);
    tone.connect(feedback);
    feedback.connect(line);
    return dryWet(context, line, tone, params.num("mix"));
  },
  tail: (params) => {
    const fb = Math.max(0.01, params.num("feedback"));
    // Repeats until they are 60 dB down, at most ten seconds.
    return Math.min(10, (params.num("time") / 1000) * (Math.log(0.001) / Math.log(fb)));
  },
});
