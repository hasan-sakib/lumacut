import { defineEffect } from "../../define.ts";
import { int, px, choice } from "../../p.ts";
import displacement from "./displacement.frag.glsl?raw";

export const displacementEffect = defineEffect({
  id: "displacement",
  name: "Displacement",
  category: "Distort",
  description: "Push pixels around using a procedural map.",
  keywords: ["displacement", "displace", "map", "noise", "distort"],
  params: [
    px("amount", "Amount", 24, 0, 160),
    px("detail", "Feature size", 80, 5, 500),
    choice("map", "Map", "noise", [
      ["noise", "Noise"],
      ["ripple", "Ripples"],
      ["gradient", "Gradient"],
    ]),
    int("seed", "Seed", 1, 0, 999),
  ],
  expand: (p) => Math.ceil(p.num("amount")),
  passes: [
    {
      shader: displacement,
      uniforms: (p, c) => ({
        uAmount: p.num("amount") * c.scale,
        uFeature: Math.max(2, p.num("detail") * c.scale),
        uMap: { int: p.choice("map") },
        uSeed: { int: p.num("seed") },
      }),
    },
  ],
});
