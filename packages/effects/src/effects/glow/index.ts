import { defineEffect } from "../../define.ts";
import { num, percent, px, color, rgb } from "../../p.ts";
import { blurPasses, EXTRACT_SHADER, GLOW_COMBINE_SHADER } from "../../shared/blur.ts";

export const glowEffect = defineEffect({
  id: "glow",
  name: "Glow",
  category: "Stylize",
  description: "Bright areas bleed a soft halo into their surroundings.",
  keywords: ["glow", "bloom", "halo", "dreamy", "light"],
  params: [
    percent("threshold", "Threshold", 0.6, 0, 1),
    px("radius", "Radius", 30, 1, 200),
    num("intensity", "Intensity", 1, 0, 5, { step: 0.05 }),
    color("tint", "Tint", rgb("#ffffff")),
  ],
  expand: (p) => Math.ceil(p.num("radius") * 1.5),
  passes: [
    { shader: EXTRACT_SHADER, uniforms: (p) => ({ uThreshold: p.num("threshold") }) },
    ...blurPasses((p) => p.num("radius") * 0.5),
    {
      shader: GLOW_COMBINE_SHADER,
      uniforms: (p) => ({
        uIntensity: p.num("intensity"),
        uTint: [p.color("tint")[0], p.color("tint")[1], p.color("tint")[2]],
      }),
    },
  ],
});
