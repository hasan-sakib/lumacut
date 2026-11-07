import { defineEffect } from "../../define.ts";
import { radians } from "../../math.ts";
import { percent, degrees, point } from "../../p.ts";
import twirl from "./twirl.frag.glsl?raw";

export const twirlEffect = defineEffect({
  id: "twirl",
  name: "Twirl",
  category: "Distort",
  description: "Twist the picture around a point.",
  keywords: ["twirl", "twist", "swirl", "spiral", "vortex"],
  params: [
    degrees("angle", "Angle", 90, -720, 720),
    percent("radius", "Radius", 0.6, 0.05, 1.5),
    point("center", "Centre", [0.5, 0.5]),
  ],
  passes: [
    {
      shader: twirl,
      uniforms: (p) => ({
        uAngle: radians(p.num("angle")),
        uRadius: p.num("radius"),
        uCenter: p.vec2("center"),
      }),
    },
  ],
});
