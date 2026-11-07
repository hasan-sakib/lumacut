import { defineTransition, vec4 } from "../../define.ts";
import { percent, color, rgb } from "../../p.ts";
import shader from "./dipToWhite.frag.glsl?raw";

export const dipToWhiteTransition = defineTransition({
  id: "dipToWhite",
  name: "Dip to white",
  description: "Flash out to white, then reveal the next clip.",
  keywords: ["dip", "white", "fade through white", "flash"],
  params: [color("color", "Colour", rgb("#ffffff")), percent("hold", "Hold", 0.1, 0, 0.8)],
  shader,
  uniforms: (p) => ({ uColor: vec4(p.color("color")), uHold: p.num("hold") }),
});
