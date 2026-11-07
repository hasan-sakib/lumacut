import { defineEffect } from "../../define.ts";
import { num, percent, px } from "../../p.ts";
import scanlines from "./scanlines.frag.glsl?raw";

export const scanlinesEffect = defineEffect({
  id: "scanlines",
  name: "Scanlines",
  category: "Stylize",
  description: "Dark horizontal lines, like an old CRT monitor.",
  keywords: ["scanlines", "crt", "tv", "retro", "monitor", "lines"],
  params: [
    px("spacing", "Spacing", 4, 2, 40, { step: 0.5 }),
    percent("intensity", "Intensity", 0.4, 0, 1),
    percent("thickness", "Thickness", 0.5, 0.05, 0.95),
    num("roll", "Roll", 0, -10, 10, { step: 0.1, description: "Pixels the lines move per frame." }),
  ],
  passes: [
    {
      shader: scanlines,
      uniforms: (p, c) => ({
        uSpacing: Math.max(2, p.num("spacing") * c.scale),
        uIntensity: p.num("intensity"),
        uThickness: p.num("thickness"),
        uRoll: p.num("roll") * c.scale,
      }),
    },
  ],
});
