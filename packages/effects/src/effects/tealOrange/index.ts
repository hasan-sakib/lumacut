import { defineEffect } from "../../define.ts";
import { percent } from "../../p.ts";
import tealOrange from "./tealOrange.frag.glsl?raw";

export const tealOrangeEffect = defineEffect({
  id: "tealOrange",
  name: "Teal & orange look",
  category: "Cinematic",
  description: "The blockbuster look: teal shadows, warm orange highlights.",
  keywords: ["teal", "orange", "cinematic", "grade", "look", "blockbuster"],
  params: [percent("amount", "Amount", 0.7, 0, 1)],
  passes: [{ shader: tealOrange, uniforms: (p) => ({ uAmount: p.num("amount") }) }],
});
