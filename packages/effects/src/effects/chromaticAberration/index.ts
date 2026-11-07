import { defineEffect } from "../../define.ts";
import { dir } from "../../math.ts";
import { px, degrees, choice, point } from "../../p.ts";
import chromaticAberration from "./chromaticAberration.frag.glsl?raw";

export const chromaticAberrationEffect = defineEffect({
  id: "chromaticAberration",
  name: "Chromatic aberration",
  category: "Stylize",
  description: "Split the colour channels apart, like a cheap lens.",
  keywords: ["chromatic", "aberration", "rgb split", "fringe", "glitch", "lens"],
  params: [
    px("amount", "Amount", 6, 0, 60, { step: 0.5 }),
    choice("mode", "Mode", "radial", [
      ["radial", "Radial (from the centre)"],
      ["linear", "Linear (one direction)"],
    ]),
    degrees("angle", "Angle", 0),
    point("center", "Centre", [0.5, 0.5]),
  ],
  expand: (p) => Math.ceil(p.num("amount")),
  passes: [
    {
      shader: chromaticAberration,
      uniforms: (p, c) => ({
        uAmount: p.num("amount") * c.scale,
        uMode: { int: p.choice("mode") },
        uAxis: dir(p.num("angle")),
        uCenter: p.vec2("center"),
      }),
    },
  ],
});
