import { EFFECTS } from "./effects/index.ts";
import { TRANSITIONS } from "./transitions/index.ts";
import {
  EFFECT_CATEGORIES,
  type EffectCategory,
  type EffectDefinition,
  type TransitionDefinition,
} from "./define.ts";

const byId = new Map(EFFECTS.map((e) => [e.id, e]));

/** The definition for an effect id stored in a project, or undefined (unknown / removed effect). */
export const effectById = (id: string): EffectDefinition | undefined => byId.get(id);

export function effectsByCategory(): { category: EffectCategory; effects: EffectDefinition[] }[] {
  return EFFECT_CATEGORIES.map((category) => ({
    category,
    effects: EFFECTS.filter((e) => e.category === category),
  })).filter((group) => group.effects.length > 0);
}

/** Effects whose name, category, description or keywords contain every word typed. */
export function searchEffects(query: string): EffectDefinition[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...EFFECTS];
  return EFFECTS.filter((e) => {
    const haystack = [e.name, e.category, e.description, ...e.keywords].join(" ").toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
}

const transitionsById = new Map(TRANSITIONS.map((t) => [t.id, t]));

/** The definition for a transition id stored in a project, or undefined. */
export const transitionById = (id: string): TransitionDefinition | undefined =>
  transitionsById.get(id);

/** Transitions whose name, description or keywords contain every word typed. */
export function searchTransitions(query: string): TransitionDefinition[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...TRANSITIONS];
  return TRANSITIONS.filter((t) => {
    const haystack = [t.name, t.description, ...t.keywords].join(" ").toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
}
