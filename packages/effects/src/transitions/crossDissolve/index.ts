import { defineTransition } from "../../define.ts";
import { bool } from "../../p.ts";
import shader from "./crossDissolve.frag.glsl?raw";

export const crossDissolveTransition = defineTransition({
  id: "crossDissolve",
  name: "Cross dissolve",
  description: "Fade from one clip into the next.",
  keywords: ["dissolve", "fade", "cross fade", "mix", "blend"],
  params: [bool("smooth", "Ease in and out", true)],
  shader,
  uniforms: (p) => ({ uSmooth: p.bool("smooth") }),
});
