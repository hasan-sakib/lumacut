import type { LinearColor, ParamDef, Params } from "./params.ts";

/** Shader inputs a pass can set (the engine maps these onto GL uniform calls). */
export type PassUniform =
  | number
  | boolean
  | readonly [number, number]
  | readonly [number, number, number]
  | readonly [number, number, number, number]
  | { int: number };

/** What a pass knows about where it runs. */
export interface PassContext {
  /** Target pixels per layer pixel: lengths in parameters are layer pixels, so multiply by this. */
  scale: number;
  /** Composition frame index (time-dependent effects). */
  frame: number;
  /** Size of the target in pixels, including padding. */
  width: number;
  height: number;
}

export interface EffectPass {
  /** Fragment shader body (GLSL ES 3.00); the shared header and helpers are added in front. */
  shader: string;
  uniforms?: (params: Params, context: PassContext) => Record<string, PassUniform>;
}

export type EffectCategory =
  "Blur & sharpen" | "Stylize" | "Distort" | "Keying" | "Generate" | "Utility" | "Cinematic";

export const EFFECT_CATEGORIES: readonly EffectCategory[] = [
  "Blur & sharpen",
  "Stylize",
  "Distort",
  "Keying",
  "Generate",
  "Utility",
  "Cinematic",
];

export interface EffectDefinition {
  /** Stable id stored in projects (`EffectInstance.effectId`). */
  id: string;
  name: string;
  category: EffectCategory;
  description: string;
  /** Extra words for search ("blur", "soften"…). */
  keywords: readonly string[];
  params: readonly ParamDef[];
  /** Layer pixels the picture can grow by on every side (blur, glow, shadow…). Default 0. */
  expand?: (params: Params) => number;
  /** Shader passes in order; each reads the previous pass (`uSrc`) and the effect's input (`uOrig`). */
  passes: readonly EffectPass[];
}

export const defineEffect = (definition: EffectDefinition): EffectDefinition => definition;

/** Convenience for uniforms: an RGBA colour as a vec4 (linear, straight alpha). */
export const vec4 = (c: LinearColor): readonly [number, number, number, number] => c;

/** What a transition pass knows about where it runs. */
export interface TransitionContext {
  /** 0 at the start of the transition, 1 at its end (linear in time). */
  progress: number;
  frame: number;
  width: number;
  height: number;
}

/**
 * A transition blends the outgoing clip (`uA`) into the incoming one (`uB`), both rendered at
 * composition size with their own transforms, colour and effects. One shader pass.
 */
export interface TransitionDefinition {
  id: string;
  name: string;
  description: string;
  keywords: readonly string[];
  params: readonly ParamDef[];
  /** Fragment shader body; the shared header, helpers and `uA`, `uB`, `uProgress` come first. */
  shader: string;
  uniforms?: (params: Params, context: TransitionContext) => Record<string, PassUniform>;
}

export const defineTransition = (definition: TransitionDefinition): TransitionDefinition =>
  definition;
