import { defineEffect } from "../../define.ts";
import { percent } from "../../p.ts";
import invert from "./invert.frag.glsl?raw";

export const invertEffect = defineEffect({
  id: "invert",
  name: "Invert",
  category: "Stylize",
  description: "Turn the picture into its negative.",
  keywords: ["invert", "negative", "reverse colours", "opposite"],
  params: [percent("amount", "Amount", 1, 0, 1)],
  passes: [{ shader: invert, uniforms: (p) => ({ uAmount: p.num("amount") }) }],
});
