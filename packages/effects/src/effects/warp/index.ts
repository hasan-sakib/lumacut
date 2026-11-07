import { defineEffect } from "../../define.ts";
import { num, int, px } from "../../p.ts";
import warp from "./warp.frag.glsl?raw";

export const warpEffect = defineEffect({
  id: "warp",
  name: "Warp",
  category: "Distort",
  description: "Ripple the picture with slow, organic distortion.",
  keywords: ["warp", "wobble", "organic", "liquid", "distort", "heat"],
  params: [
    px("amount", "Amount", 20, 0, 120),
    px("detail", "Feature size", 120, 10, 600),
    num("speed", "Speed", 0.5, 0, 4, { step: 0.05 }),
    int("seed", "Seed", 1, 0, 999),
  ],
  expand: (p) => Math.ceil(p.num("amount")),
  passes: [
    {
      shader: warp,
      uniforms: (p, c) => ({
        uAmount: p.num("amount") * c.scale,
        uFeature: Math.max(2, p.num("detail") * c.scale),
        uSpeed: p.num("speed"),
        uSeed: { int: p.num("seed") },
      }),
    },
  ],
});
