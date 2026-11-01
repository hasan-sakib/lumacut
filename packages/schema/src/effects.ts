import * as z from "zod";
import { Color, Id, TimeUs, Vec2 } from "./primitives.ts";
import { named } from "./registry.ts";

export const ParamValue = named(
  "ParamValue",
  z.union([z.number(), z.boolean(), z.string(), Vec2, Color]),
  "Value of an effect/transition parameter; its type is defined by the effect's param schema.",
);
export type ParamValue = z.infer<typeof ParamValue>;

export const ParamValues = named("ParamValues", z.record(z.string().min(1), ParamValue));
export type ParamValues = z.infer<typeof ParamValues>;

export const EffectInstance = named(
  "EffectInstance",
  z.strictObject({
    id: Id,
    effectId: z.string().min(1),
    enabled: z.boolean(),
    params: ParamValues,
  }),
  "Visual effect applied to a clip; effectId references a definition in packages/effects.",
);
export type EffectInstance = z.infer<typeof EffectInstance>;

export const AudioEffectInstance = named(
  "AudioEffectInstance",
  z.strictObject({
    id: Id,
    effectId: z.string().min(1),
    enabled: z.boolean(),
    params: ParamValues,
  }),
  "Audio effect (EQ, compressor, ...) applied to a clip's audio.",
);
export type AudioEffectInstance = z.infer<typeof AudioEffectInstance>;

export const TransitionAlignment = named(
  "TransitionAlignment",
  z.enum(["center", "start", "end"]),
  "Where the transition sits relative to the cut: centered on it, starting at it, or ending at it.",
);
export type TransitionAlignment = z.infer<typeof TransitionAlignment>;

export const TransitionInstance = named(
  "TransitionInstance",
  z.strictObject({
    id: Id,
    transitionId: z.string().min(1),
    durationUs: TimeUs.min(1),
    alignment: TransitionAlignment,
    params: ParamValues,
  }),
  "Transition from the previous clip on the same track into this clip.",
);
export type TransitionInstance = z.infer<typeof TransitionInstance>;
