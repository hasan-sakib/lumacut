import { defineEffect } from "../../define.ts";
import { radians } from "../../math.ts";
import { degrees, point } from "../../p.ts";
import radialBlur from "./radialBlur.frag.glsl?raw";

export const radialBlurEffect = defineEffect({
  id: "radialBlur",
  name: "Radial blur",
  category: "Blur & sharpen",
  description: "Spin-blur the picture around a point.",
  keywords: ["blur", "spin", "rotate", "swirl", "circular"],
  params: [degrees("amount", "Amount", 10, 0, 90), point("center", "Centre", [0.5, 0.5])],
  passes: [
    {
      shader: radialBlur,
      uniforms: (p) => ({ uAngle: radians(p.num("amount")), uCenter: p.vec2("center") }),
    },
  ],
});
