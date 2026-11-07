import { defineEffect, vec4 } from "../../define.ts";
import { num, int, percent, color, rgb } from "../../p.ts";
import lightLeaks from "./lightLeaks.frag.glsl?raw";

export const lightLeaksEffect = defineEffect({
  id: "lightLeaks",
  name: "Light leaks",
  category: "Stylize",
  description: "Drifting, glowing colour washes, like light getting into a film camera.",
  keywords: ["light leak", "leak", "film", "flare", "warm", "vintage"],
  params: [
    percent("intensity", "Intensity", 0.7, 0, 2),
    num("speed", "Speed", 1, 0, 5, { step: 0.05 }),
    int("seed", "Seed", 3, 0, 999),
    color("colorA", "Colour A", rgb("#ff7a2f")),
    color("colorB", "Colour B", rgb("#ff2f8a")),
  ],
  passes: [
    {
      shader: lightLeaks,
      uniforms: (p) => ({
        uIntensity: p.num("intensity"),
        uSpeed: p.num("speed"),
        uSeed: { int: p.num("seed") },
        uColorA: vec4(p.color("colorA")),
        uColorB: vec4(p.color("colorB")),
      }),
    },
  ],
});
