import { defineEffect } from "../../define.ts";
import { int } from "../../p.ts";
import posterize from "./posterize.frag.glsl?raw";

export const posterizeEffect = defineEffect({
  id: "posterize",
  name: "Posterize",
  category: "Stylize",
  description: "Reduce the picture to a few flat tones per channel.",
  keywords: ["posterize", "levels", "flat", "poster", "quantize"],
  params: [int("levels", "Levels", 5, 2, 32)],
  passes: [{ shader: posterize, uniforms: (p) => ({ uLevels: p.num("levels") }) }],
});
