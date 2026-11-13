import {
  AUDIO_EFFECT_CATEGORIES,
  type AudioEffectCategory,
  type AudioEffectDefinition,
} from "./define.ts";
import { compressor, limiter, noiseGate } from "./dynamics.ts";
import { eq } from "./eq.ts";
import { delay, reverb } from "./space.ts";

/** Every audio effect, in the order the browser lists them. */
export const AUDIO_EFFECTS: readonly AudioEffectDefinition[] = [
  eq,
  compressor,
  limiter,
  noiseGate,
  reverb,
  delay,
];

const byId = new Map(AUDIO_EFFECTS.map((e) => [e.id, e]));

export const audioEffectById = (id: string): AudioEffectDefinition | undefined => byId.get(id);

export function audioEffectsByCategory(): {
  category: AudioEffectCategory;
  effects: AudioEffectDefinition[];
}[] {
  return AUDIO_EFFECT_CATEGORIES.map((category) => ({
    category,
    effects: AUDIO_EFFECTS.filter((e) => e.category === category),
  })).filter((g) => g.effects.length > 0);
}

export {
  AUDIO_EFFECT_CATEGORIES,
  dbToGain,
  defineAudioEffect,
  dryWet,
  seededRandom,
  type AudioEffectCategory,
  type AudioEffectDefinition,
  type AudioGraph,
  type SampleProcessor,
} from "./define.ts";
export { NoiseGate, type GateSettings } from "./gate-dsp.ts";
