import type { EffectPass } from "../define.ts";
import blurShader from "./blur.frag.glsl?raw";
import extractShader from "./extract.frag.glsl?raw";
import glowCombineShader from "./glow-combine.frag.glsl?raw";

/** Horizontal then vertical Gaussian blur; `sigma` is in layer pixels (the passes scale it to the target). */
export function blurPasses(
  sigma: (p: Parameters<NonNullable<EffectPass["uniforms"]>>[0]) => number,
): EffectPass[] {
  return [
    {
      shader: blurShader,
      uniforms: (p, c) => ({ uDir: [1, 0], uSigma: sigma(p) * c.scale }),
    },
    {
      shader: blurShader,
      uniforms: (p, c) => ({ uDir: [0, 1], uSigma: sigma(p) * c.scale }),
    },
  ];
}

export const BLUR_SHADER = blurShader;
export const EXTRACT_SHADER = extractShader;
export const GLOW_COMBINE_SHADER = glowCombineShader;
