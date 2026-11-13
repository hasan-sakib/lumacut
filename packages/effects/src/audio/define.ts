import type { ParamDef, Params } from "../params.ts";

/** A piece of Web Audio graph: connect into `input`, take the sound from `output`. */
export interface AudioGraph {
  input: AudioNode;
  output: AudioNode;
}

/** Runs on decoded samples before they are played (streaming: state carries across calls). */
export interface SampleProcessor {
  /** Changes the channels in place. */
  process: (channels: Float32Array[]) => void;
}

export type AudioEffectCategory = "EQ & filter" | "Dynamics" | "Space";

export const AUDIO_EFFECT_CATEGORIES: readonly AudioEffectCategory[] = [
  "EQ & filter",
  "Dynamics",
  "Space",
];

/**
 * An audio effect is a definition like a visual one: its parameters build the Inspector rows, and
 * either `build` makes native Web Audio nodes for it or `processor` works on the samples. The same
 * definition is used for playback and for offline mixdown, so they sound the same.
 */
export interface AudioEffectDefinition {
  /** Stable id stored in projects (`AudioEffectInstance.effectId`). */
  id: string;
  name: string;
  category: AudioEffectCategory;
  description: string;
  keywords: readonly string[];
  params: readonly ParamDef[];
  build?: (context: BaseAudioContext, params: Params) => AudioGraph;
  processor?: (sampleRate: number, params: Params) => SampleProcessor;
  /** Seconds the effect keeps sounding after its input stops (reverb, echo). Default 0. */
  tail?: (params: Params) => number;
}

export const defineAudioEffect = (definition: AudioEffectDefinition): AudioEffectDefinition =>
  definition;

/** A dry/wet mix around a wet path: `input → dry → output` and `input → wet path → wet → output`. */
export function dryWet(
  context: BaseAudioContext,
  wetIn: AudioNode,
  wetOut: AudioNode,
  mix: number,
): AudioGraph {
  const input = context.createGain();
  const output = context.createGain();
  const dry = context.createGain();
  const wet = context.createGain();
  // Equal-power mix, so 50% isn't a dip in level.
  dry.gain.value = Math.cos((mix * Math.PI) / 2);
  wet.gain.value = Math.sin((mix * Math.PI) / 2);
  input.connect(dry);
  dry.connect(output);
  input.connect(wetIn);
  wetOut.connect(wet);
  wet.connect(output);
  return { input, output };
}

/** A deterministic random sequence (mulberry32), for generated impulse responses. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const dbToGain = (db: number): number => 10 ** (db / 20);
