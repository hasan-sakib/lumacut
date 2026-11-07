import type { EffectDefinition } from "../define.ts";
import { gaussianBlurEffect } from "./gaussianBlur/index.ts";
import { directionalBlurEffect } from "./directionalBlur/index.ts";
import { radialBlurEffect } from "./radialBlur/index.ts";
import { zoomBlurEffect } from "./zoomBlur/index.ts";
import { lensBlurEffect } from "./lensBlur/index.ts";
import { sharpenEffect } from "./sharpen/index.ts";
import { glowEffect } from "./glow/index.ts";
import { vignetteEffect } from "./vignette/index.ts";
import { filmGrainEffect } from "./filmGrain/index.ts";
import { chromaticAberrationEffect } from "./chromaticAberration/index.ts";
import { halftoneEffect } from "./halftone/index.ts";
import { posterizeEffect } from "./posterize/index.ts";
import { pixelateEffect } from "./pixelate/index.ts";
import { edgeDetectEffect } from "./edgeDetect/index.ts";
import { lightLeaksEffect } from "./lightLeaks/index.ts";
import { warpEffect } from "./warp/index.ts";
import { rippleEffect } from "./ripple/index.ts";
import { waveEffect } from "./wave/index.ts";
import { twirlEffect } from "./twirl/index.ts";
import { fisheyeEffect } from "./fisheye/index.ts";
import { mirrorEffect } from "./mirror/index.ts";
import { kaleidoscopeEffect } from "./kaleidoscope/index.ts";
import { displacementEffect } from "./displacement/index.ts";
import { chromaKeyEffect } from "./chromaKey/index.ts";
import { lumaKeyEffect } from "./lumaKey/index.ts";
import { gradientEffect } from "./gradient/index.ts";
import { noiseEffect } from "./noise/index.ts";
import { gridEffect } from "./grid/index.ts";
import { dropShadowEffect } from "./dropShadow/index.ts";
import { strokeEffect } from "./stroke/index.ts";
import { innerGlowEffect } from "./innerGlow/index.ts";
import { outerGlowEffect } from "./outerGlow/index.ts";
import { fillEffect } from "./fill/index.ts";
import { letterboxEffect } from "./letterbox/index.ts";
import { anamorphicFlareEffect } from "./anamorphicFlare/index.ts";
import { tealOrangeEffect } from "./tealOrange/index.ts";
import { invertEffect } from "./invert/index.ts";
import { thresholdEffect } from "./threshold/index.ts";
import { duotoneEffect } from "./duotone/index.ts";
import { scanlinesEffect } from "./scanlines/index.ts";

/** Every effect, in the order the browser lists them within a category. */
export const EFFECTS: readonly EffectDefinition[] = [
  gaussianBlurEffect,
  directionalBlurEffect,
  radialBlurEffect,
  zoomBlurEffect,
  lensBlurEffect,
  sharpenEffect,
  glowEffect,
  vignetteEffect,
  filmGrainEffect,
  chromaticAberrationEffect,
  halftoneEffect,
  posterizeEffect,
  pixelateEffect,
  edgeDetectEffect,
  lightLeaksEffect,
  warpEffect,
  rippleEffect,
  waveEffect,
  twirlEffect,
  fisheyeEffect,
  mirrorEffect,
  kaleidoscopeEffect,
  displacementEffect,
  chromaKeyEffect,
  lumaKeyEffect,
  gradientEffect,
  noiseEffect,
  gridEffect,
  dropShadowEffect,
  strokeEffect,
  innerGlowEffect,
  outerGlowEffect,
  fillEffect,
  letterboxEffect,
  anamorphicFlareEffect,
  tealOrangeEffect,
  invertEffect,
  thresholdEffect,
  duotoneEffect,
  scanlinesEffect,
];
