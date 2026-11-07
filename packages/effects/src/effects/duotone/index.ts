import { defineEffect } from "../../define.ts";
import { percent, color, rgb } from "../../p.ts";
import duotone from "./duotone.frag.glsl?raw";

export const duotoneEffect = defineEffect({
  id: "duotone",
  name: "Duotone",
  category: "Stylize",
  description: "Map the picture's brightness onto two colours.",
  keywords: ["duotone", "two colour", "gradient map", "spotify", "tint"],
  params: [
    color("shadows", "Shadows", rgb("#1b1464")),
    color("highlights", "Highlights", rgb("#ffb347")),
    percent("amount", "Amount", 1, 0, 1),
  ],
  passes: [
    {
      shader: duotone,
      uniforms: (p) => ({
        uDark: [p.color("shadows")[0], p.color("shadows")[1], p.color("shadows")[2]],
        uLight: [p.color("highlights")[0], p.color("highlights")[1], p.color("highlights")[2]],
        uAmount: p.num("amount"),
      }),
    },
  ],
});
