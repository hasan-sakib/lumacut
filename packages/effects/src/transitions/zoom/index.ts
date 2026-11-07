import { defineTransition } from "../../define.ts";
import { percent, point } from "../../p.ts";
import shader from "./zoom.frag.glsl?raw";

export const zoomTransition = defineTransition({
  id: "zoom",
  name: "Zoom",
  description: "Zoom into the current clip and out of the next.",
  keywords: ["zoom", "scale", "punch", "through"],
  params: [percent("strength", "Strength", 1, 0.1, 4), point("center", "Centre", [0.5, 0.5])],
  shader,
  uniforms: (p) => ({ uStrength: p.num("strength"), uCenter: p.vec2("center") }),
});
