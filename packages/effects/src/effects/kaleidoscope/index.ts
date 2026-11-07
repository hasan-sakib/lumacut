import { defineEffect } from "../../define.ts";
import { radians } from "../../math.ts";
import { int, degrees, point } from "../../p.ts";
import kaleidoscope from "./kaleidoscope.frag.glsl?raw";

export const kaleidoscopeEffect = defineEffect({
  id: "kaleidoscope",
  name: "Kaleidoscope",
  category: "Distort",
  description: "Repeat a wedge of the picture around a point.",
  keywords: ["kaleidoscope", "mandala", "symmetry", "tiles", "fractal"],
  params: [
    int("segments", "Segments", 6, 2, 32),
    degrees("angle", "Angle", 0),
    point("center", "Centre", [0.5, 0.5]),
  ],
  passes: [
    {
      shader: kaleidoscope,
      uniforms: (p) => ({
        uSegments: p.num("segments"),
        uAngle: radians(p.num("angle")),
        uCenter: p.vec2("center"),
      }),
    },
  ],
});
