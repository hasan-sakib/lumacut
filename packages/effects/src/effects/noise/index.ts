import { defineEffect } from "../../define.ts";
import { num, int, percent, px, bool, choice } from "../../p.ts";
import noiseFill from "./noiseFill.frag.glsl?raw";

export const noiseEffect = defineEffect({
  id: "noise",
  name: "Noise",
  category: "Generate",
  description: "Fill with animated cloudy noise, or add it to the picture.",
  keywords: ["noise", "clouds", "texture", "procedural", "perlin", "static"],
  params: [
    px("grain", "Feature size", 80, 4, 600),
    percent("amount", "Amount", 1, 0, 1),
    num("speed", "Speed", 0.3, 0, 5, { step: 0.05 }),
    bool("colorful", "Coloured", false),
    int("seed", "Seed", 1, 0, 999),
    choice("blend", "Combine", "replace", [
      ["replace", "Replace the picture"],
      ["add", "Add to the picture"],
    ]),
  ],
  passes: [
    {
      shader: noiseFill,
      uniforms: (p, c) => ({
        uFeature: Math.max(2, p.num("grain") * c.scale),
        uAmount: p.num("amount"),
        uSpeed: p.num("speed"),
        uColorful: p.bool("colorful"),
        uSeed: { int: p.num("seed") },
        uBlend: { int: p.choice("blend") },
      }),
    },
  ],
});
