import { defineEffect } from "../../define.ts";
import { radians } from "../../math.ts";
import { percent, px, degrees, choice } from "../../p.ts";
import halftone from "./halftone.frag.glsl?raw";

export const halftoneEffect = defineEffect({
  id: "halftone",
  name: "Halftone",
  category: "Stylize",
  description: "Turn the picture into a pattern of printed dots.",
  keywords: ["halftone", "dots", "print", "comic", "pop art"],
  params: [
    px("dotSize", "Dot size", 8, 2, 60),
    degrees("angle", "Angle", 45, 0, 90),
    percent("contrast", "Contrast", 1, 0.2, 2),
    choice("style", "Ink", "mono", [
      ["mono", "Black on white"],
      ["color", "Coloured dots"],
    ]),
  ],
  passes: [
    {
      shader: halftone,
      uniforms: (p, c) => ({
        uCell: Math.max(2, p.num("dotSize") * c.scale),
        uAngle: radians(p.num("angle")),
        uContrast: p.num("contrast"),
        uStyle: { int: p.choice("style") },
      }),
    },
  ],
});
