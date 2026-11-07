import { defineEffect, vec4 } from "../../define.ts";
import { num, percent, px, color, rgb } from "../../p.ts";
import { blurPasses } from "../../shared/blur.ts";
import outerGlow from "./outerGlow.frag.glsl?raw";

export const outerGlowEffect = defineEffect({
  id: "outerGlow",
  name: "Outer glow",
  category: "Utility",
  description: "A soft glow around the outside of the shape.",
  keywords: ["outer glow", "glow", "halo", "aura", "neon"],
  params: [
    color("glowColor", "Colour", rgb("#ffe27a")),
    px("size", "Size", 30, 1, 200),
    num("intensity", "Intensity", 1.5, 0, 6, { step: 0.05 }),
    percent("opacity", "Opacity", 1, 0, 1),
  ],
  expand: (p) => Math.ceil(p.num("size") * 1.5),
  passes: [
    ...blurPasses((p) => p.num("size") * 0.5),
    {
      shader: outerGlow,
      uniforms: (p) => ({
        uColor: vec4(p.color("glowColor")),
        uIntensity: p.num("intensity"),
        uOpacity: p.num("opacity"),
      }),
    },
  ],
});
