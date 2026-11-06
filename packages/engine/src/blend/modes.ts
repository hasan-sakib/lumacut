import { BlendMode } from "@lumacut/schema";

/** Blend modes in the order the shader's `switch` uses; the index is the contract. */
export const BLEND_MODES: readonly BlendMode[] = BlendMode.options;

export function blendModeIndex(mode: BlendMode): number {
  const index = BLEND_MODES.indexOf(mode);
  if (index < 0) throw new RangeError(`Unknown blend mode "${mode}"`);
  return index;
}
