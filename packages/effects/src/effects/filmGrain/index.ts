import { defineEffect } from "../../define.ts";
import { int, percent, px, bool } from "../../p.ts";
import filmGrain from "./filmGrain.frag.glsl?raw";

export const filmGrainEffect = defineEffect({
  id: "filmGrain",
  name: "Film grain",
  category: "Stylize",
  description: "Add animated film grain (different every frame, repeatable for the same frame).",
  keywords: ["grain", "noise", "film", "texture", "analog"],
  params: [
    percent("amount", "Amount", 0.25, 0, 1),
    px("grainSize", "Grain size", 1.5, 1, 8, { step: 0.1 }),
    bool("colored", "Colour grain", false),
    int("seed", "Seed", 1, 0, 9999),
  ],
  passes: [
    {
      shader: filmGrain,
      uniforms: (p, c) => ({
        uAmount: p.num("amount"),
        uGrain: Math.max(1, p.num("grainSize") * c.scale),
        uColored: p.bool("colored"),
        uSeed: { int: p.num("seed") },
      }),
    },
  ],
});
