import { defineEffect } from "../../define.ts";
import { radians } from "../../math.ts";
import { px, degrees, point } from "../../p.ts";
import ripple from "./ripple.frag.glsl?raw";

export const rippleEffect = defineEffect({
  id: "ripple",
  name: "Ripple",
  category: "Distort",
  description: "Concentric waves spreading from a point, like a drop in water.",
  keywords: ["ripple", "water", "waves", "concentric", "pond"],
  params: [
    px("amount", "Amount", 14, 0, 100),
    px("wavelength", "Wavelength", 60, 5, 400),
    degrees("phase", "Phase", 0, -3600, 3600),
    point("center", "Centre", [0.5, 0.5]),
  ],
  expand: (p) => Math.ceil(p.num("amount")),
  passes: [
    {
      shader: ripple,
      uniforms: (p, c) => ({
        uAmount: p.num("amount") * c.scale,
        uWavelength: Math.max(2, p.num("wavelength") * c.scale),
        uPhase: radians(p.num("phase")),
        uCenter: p.vec2("center"),
      }),
    },
  ],
});
