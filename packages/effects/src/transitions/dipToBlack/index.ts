import { defineTransition, vec4 } from "../../define.ts";
import { percent, color, rgb } from "../../p.ts";
import shader from "./dipToBlack.frag.glsl?raw";

export const dipToBlackTransition = defineTransition({
  id: "dipToBlack",
  name: "Dip to black",
  description: "Fade out to black, then fade in the next clip.",
  keywords: ["dip", "black", "fade through black", "fade out"],
  params: [color("color", "Colour", rgb("#000000")), percent("hold", "Hold", 0.1, 0, 0.8)],
  shader,
  uniforms: (p) => ({ uColor: vec4(p.color("color")), uHold: p.num("hold") }),
});
