import { Params } from "../params.ts";
import { bool, num } from "../p.ts";
import { defineAudioEffect } from "./define.ts";

const hz = (id: string, label: string, value: number, min: number, max: number) =>
  num(id, label, value, min, max, { unit: "Hz", step: 1 });
const db = (id: string, label: string) => num(id, label, 0, -24, 24, { unit: "dB", step: 0.5 });

export const eq = defineAudioEffect({
  id: "eq",
  name: "Equaliser",
  category: "EQ & filter",
  description:
    "Shape the tone: cut rumble and hiss, warm up or brighten a voice, scoop a muddy middle. Five bands: low cut, low shelf, mid bell, high shelf, high cut.",
  keywords: [
    "eq",
    "equalizer",
    "bass",
    "treble",
    "tone",
    "low cut",
    "high pass",
    "rumble",
    "muddy",
  ],
  params: [
    bool("lowCut", "Low cut", false),
    hz("lowCutFreq", "Low cut at", 80, 20, 1000),
    hz("lowFreq", "Low shelf at", 120, 20, 1000),
    db("lowGain", "Low"),
    hz("midFreq", "Mid at", 1000, 100, 10000),
    db("midGain", "Mid"),
    num("midQ", "Mid width (Q)", 1, 0.1, 10, { step: 0.1 }),
    hz("highFreq", "High shelf at", 8000, 1000, 20000),
    db("highGain", "High"),
    bool("highCut", "High cut", false),
    hz("highCutFreq", "High cut at", 12000, 1000, 20000),
  ],
  build: (context, params: Params) => {
    const filter = (type: BiquadFilterType, freq: number, gain = 0, q = 0.7071) => {
      const node = context.createBiquadFilter();
      node.type = type;
      node.frequency.value = Math.min(freq, context.sampleRate / 2 - 1);
      node.gain.value = gain;
      node.Q.value = q;
      return node;
    };
    const chain: BiquadFilterNode[] = [];
    if (params.bool("lowCut")) chain.push(filter("highpass", params.num("lowCutFreq")));
    chain.push(filter("lowshelf", params.num("lowFreq"), params.num("lowGain")));
    chain.push(filter("peaking", params.num("midFreq"), params.num("midGain"), params.num("midQ")));
    chain.push(filter("highshelf", params.num("highFreq"), params.num("highGain")));
    if (params.bool("highCut")) chain.push(filter("lowpass", params.num("highCutFreq")));
    for (let i = 0; i + 1 < chain.length; i += 1) chain[i]?.connect(chain[i + 1] as AudioNode);
    const first = chain[0];
    const last = chain[chain.length - 1];
    if (first === undefined || last === undefined) throw new Error("empty EQ");
    return { input: first, output: last };
  },
});
