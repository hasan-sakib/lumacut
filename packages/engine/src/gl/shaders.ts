import { BLEND_MODES } from "../blend/modes.ts";
import blendSource from "./shaders/blend.glsl?raw";
import fullscreenVert from "./shaders/fullscreen.vert.glsl?raw";
import layerFrag from "./shaders/layer.frag.glsl?raw";
import layerVert from "./shaders/layer.vert.glsl?raw";
import presentFrag from "./shaders/present.frag.glsl?raw";

/** `const int BM_<MODE> = <index>;` for every schema blend mode, so the shader can't drift. */
export function blendConstants(): string {
  return BLEND_MODES.map((mode, i) => `const int BM_${mode.toUpperCase()} = ${String(i)};`).join(
    "\n",
  );
}

function withBlend(): string {
  return layerFrag.replace("//__BLEND__", `${blendConstants()}\n${blendSource}`);
}

/** The `#version` line must stay first, so defines are inserted right after it. */
function define(source: string, name: string): string {
  return source.replace("#version 300 es", `#version 300 es\n#define ${name}`);
}

export const SHADERS = {
  layerVert,
  /** Normal mode: output the layer; fixed-function blending composites it. */
  layerFragNormal: layerFrag.replace("//__BLEND__", ""),
  /** Every other mode: reads the backdrop and writes the composited result. */
  layerFragBlend: define(withBlend(), "BLEND"),
  fullscreenVert,
  presentFrag,
} as const;
