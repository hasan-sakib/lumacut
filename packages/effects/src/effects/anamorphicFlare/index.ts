import { defineEffect } from "../../define.ts";
import { num, percent, px, color, rgb } from "../../p.ts";
import { BLUR_SHADER, EXTRACT_SHADER, GLOW_COMBINE_SHADER } from "../../shared/blur.ts";

export const anamorphicFlareEffect = defineEffect({
  id: "anamorphicFlare",
  name: "Anamorphic flare",
  category: "Cinematic",
  description: "Horizontal light streaks from the brightest highlights, like an anamorphic lens.",
  keywords: ["anamorphic", "flare", "streak", "lens flare", "cinematic", "j.j."],
  params: [
    percent("threshold", "Threshold", 0.7, 0, 1),
    px("length", "Length", 240, 10, 1200),
    num("intensity", "Intensity", 1, 0, 5, { step: 0.05 }),
    color("tint", "Tint", rgb("#6aa8ff")),
  ],
  expand: (p) => Math.ceil(p.num("length") * 0.8),
  passes: [
    { shader: EXTRACT_SHADER, uniforms: (p) => ({ uThreshold: p.num("threshold") }) },
    {
      shader: BLUR_SHADER,
      uniforms: (p, c) => ({ uDir: [1, 0], uSigma: p.num("length") * 0.25 * c.scale }),
    },
    {
      shader: BLUR_SHADER,
      uniforms: (p, c) => ({ uDir: [1, 0], uSigma: p.num("length") * 0.15 * c.scale }),
    },
    {
      shader: GLOW_COMBINE_SHADER,
      uniforms: (p) => ({
        uIntensity: p.num("intensity"),
        uTint: [p.color("tint")[0], p.color("tint")[1], p.color("tint")[2]],
      }),
    },
  ],
});
