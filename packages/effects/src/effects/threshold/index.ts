import { defineEffect } from "../../define.ts";
import { percent } from "../../p.ts";
import threshold from "./threshold.frag.glsl?raw";

export const thresholdEffect = defineEffect({
  id: "threshold",
  name: "Threshold",
  category: "Stylize",
  description: "Turn the picture into pure black and white.",
  keywords: ["threshold", "black and white", "high contrast", "bitmap", "stencil"],
  params: [percent("level", "Level", 0.5, 0, 1), percent("softness", "Softness", 0.02, 0, 0.5)],
  passes: [
    {
      shader: threshold,
      uniforms: (p) => ({ uLevel: p.num("level"), uSoftness: p.num("softness") }),
    },
  ],
});
