import { defineEffect } from "../../define.ts";
import { num, point } from "../../p.ts";
import fisheye from "./fisheye.frag.glsl?raw";

export const fisheyeEffect = defineEffect({
  id: "fisheye",
  name: "Fisheye",
  category: "Distort",
  description: "Bulge or pinch the picture like a wide-angle lens.",
  keywords: ["fisheye", "lens", "bulge", "pinch", "wide angle", "barrel"],
  params: [
    num("strength", "Strength", 0.5, -1, 1, { step: 0.01 }),
    point("center", "Centre", [0.5, 0.5]),
  ],
  passes: [
    {
      shader: fisheye,
      uniforms: (p) => ({ uStrength: p.num("strength"), uCenter: p.vec2("center") }),
    },
  ],
});
