import { defineTransition } from "../../define.ts";
import { percent } from "../../p.ts";
import shader from "./blurDissolve.frag.glsl?raw";

export const blurDissolveTransition = defineTransition({
  id: "blurDissolve",
  name: "Blur dissolve",
  description: "Dissolve while both clips blur, peaking mid-way.",
  keywords: ["blur", "dissolve", "soft", "dream"],
  params: [percent("amount", "Blur", 0.04, 0, 0.2)],
  shader,
  uniforms: (p) => ({ uAmount: p.num("amount") }),
});
