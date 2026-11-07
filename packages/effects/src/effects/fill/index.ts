import { defineEffect, vec4 } from "../../define.ts";
import { percent, color, rgb } from "../../p.ts";
import fill from "./fill.frag.glsl?raw";

export const fillEffect = defineEffect({
  id: "fill",
  name: "Fill",
  category: "Utility",
  description: "Paint the shape of the picture with a flat colour.",
  keywords: ["fill", "colour", "solid", "tint", "silhouette", "flat"],
  params: [color("fillColor", "Colour", rgb("#ff3b6b")), percent("opacity", "Opacity", 1, 0, 1)],
  passes: [
    {
      shader: fill,
      uniforms: (p) => ({ uColor: vec4(p.color("fillColor")), uOpacity: p.num("opacity") }),
    },
  ],
});
