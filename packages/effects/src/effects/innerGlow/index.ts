import { defineEffect, vec4 } from "../../define.ts";
import { num, percent, px, color, rgb } from "../../p.ts";
import { blurPasses } from "../../shared/blur.ts";
import invertAlpha from "./invertAlpha.frag.glsl?raw";
import innerGlow from "./innerGlow.frag.glsl?raw";

export const innerGlowEffect = defineEffect({
  id: "innerGlow",
  name: "Inner glow",
  category: "Utility",
  description: "A soft glow just inside the edges of the shape.",
  keywords: ["inner glow", "glow", "edge light", "rim"],
  params: [
    color("glowColor", "Colour", rgb("#ffffff")),
    px("size", "Size", 24, 1, 160),
    num("intensity", "Intensity", 1, 0, 4, { step: 0.05 }),
    percent("opacity", "Opacity", 1, 0, 1),
  ],
  expand: (p) => Math.ceil(p.num("size") * 1.5),
  passes: [
    { shader: invertAlpha },
    ...blurPasses((p) => p.num("size") * 0.5),
    {
      shader: innerGlow,
      uniforms: (p) => ({
        uColor: vec4(p.color("glowColor")),
        uIntensity: p.num("intensity"),
        uOpacity: p.num("opacity"),
      }),
    },
  ],
});
