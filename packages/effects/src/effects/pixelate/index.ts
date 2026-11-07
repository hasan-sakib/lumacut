import { defineEffect } from "../../define.ts";
import { px } from "../../p.ts";
import pixelate from "./pixelate.frag.glsl?raw";

export const pixelateEffect = defineEffect({
  id: "pixelate",
  name: "Pixelate",
  category: "Stylize",
  description: "Turn the picture into big square pixels.",
  keywords: ["pixelate", "mosaic", "8-bit", "retro", "censor"],
  params: [px("cell", "Pixel size", 12, 1, 120)],
  passes: [
    { shader: pixelate, uniforms: (p, c) => ({ uCell: Math.max(1, p.num("cell") * c.scale) }) },
  ],
});
