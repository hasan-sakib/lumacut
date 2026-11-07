import { defineEffect, vec4 } from "../../define.ts";
import { dir } from "../../math.ts";
import { percent, degrees, choice, color, rgb } from "../../p.ts";
import gradient from "./gradient.frag.glsl?raw";

export const gradientEffect = defineEffect({
  id: "gradient",
  name: "Gradient",
  category: "Generate",
  description: "Fill with a linear or radial gradient, or blend one over the picture.",
  keywords: ["gradient", "ramp", "fill", "colour wash", "background"],
  params: [
    choice("kind", "Type", "linear", [
      ["linear", "Linear"],
      ["radial", "Radial"],
    ]),
    color("colorA", "Start colour", rgb("#ff7a2f")),
    color("colorB", "End colour", rgb("#2f6bff")),
    degrees("angle", "Angle", 90),
    percent("opacity", "Opacity", 1, 0, 1),
    choice("blend", "Combine", "replace", [
      ["replace", "Replace the picture"],
      ["over", "Over the picture"],
      ["multiply", "Multiply"],
      ["screen", "Screen"],
    ]),
  ],
  passes: [
    {
      shader: gradient,
      uniforms: (p) => ({
        uKind: { int: p.choice("kind") },
        uBlend: { int: p.choice("blend") },
        uColorA: vec4(p.color("colorA")),
        uColorB: vec4(p.color("colorB")),
        uAxis: dir(p.num("angle")),
        uOpacity: p.num("opacity"),
      }),
    },
  ],
});
