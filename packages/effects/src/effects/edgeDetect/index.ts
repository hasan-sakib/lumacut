import { defineEffect } from "../../define.ts";
import { num, bool, choice } from "../../p.ts";
import edgeDetect from "./edgeDetect.frag.glsl?raw";

export const edgeDetectEffect = defineEffect({
  id: "edgeDetect",
  name: "Edge detect",
  category: "Stylize",
  description: "Find the outlines in the picture.",
  keywords: ["edges", "outline", "sketch", "sobel", "line art"],
  params: [
    num("strength", "Strength", 2, 0, 8, { step: 0.05 }),
    choice("mode", "Show", "edges", [
      ["edges", "Edges only"],
      ["overlay", "Dark lines over the picture"],
      ["color", "Coloured edges"],
    ]),
    bool("invert", "Invert", false),
  ],
  passes: [
    {
      shader: edgeDetect,
      uniforms: (p) => ({
        uStrength: p.num("strength"),
        uMode: { int: p.choice("mode") },
        uInvert: p.bool("invert"),
      }),
    },
  ],
});
