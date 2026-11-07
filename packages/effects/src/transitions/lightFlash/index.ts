import { defineTransition, vec4 } from "../../define.ts";
import { percent, color, rgb } from "../../p.ts";
import shader from "./lightFlash.frag.glsl?raw";

export const lightFlashTransition = defineTransition({
  id: "lightFlash",
  name: "Light flash",
  description: "A burst of light covers the cut.",
  keywords: ["flash", "light", "burst", "bright", "strobe"],
  params: [color("color", "Colour", rgb("#ffffff")), percent("intensity", "Intensity", 1.2, 0, 3)],
  shader,
  uniforms: (p) => ({ uColor: vec4(p.color("color")), uIntensity: p.num("intensity") }),
});
