import { defineEffect } from "../../define.ts";
import { num, percent } from "../../p.ts";
import vignette from "./vignette.frag.glsl?raw";

export const vignetteEffect = defineEffect({
  id: "vignette",
  name: "Vignette",
  category: "Stylize",
  description: "Darken (or lighten) the edges of the picture.",
  keywords: ["vignette", "darken edges", "frame", "spotlight"],
  params: [
    num("amount", "Amount", 0.5, -1, 1, { step: 0.01 }),
    percent("size", "Size", 0.6, 0, 1.2),
    percent("softness", "Softness", 0.5, 0, 1),
    percent("roundness", "Roundness", 0.5, 0, 1),
  ],
  passes: [
    {
      shader: vignette,
      uniforms: (p) => ({
        uAmount: p.num("amount"),
        uSize: p.num("size"),
        uSoftness: p.num("softness"),
        uRoundness: p.num("roundness"),
      }),
    },
  ],
});
