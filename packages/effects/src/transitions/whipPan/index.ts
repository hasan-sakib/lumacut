import { defineTransition } from "../../define.ts";
import { percent, choice } from "../../p.ts";
import shader from "./whipPan.frag.glsl?raw";

export const whipPanTransition = defineTransition({
  id: "whipPan",
  name: "Whip pan",
  description: "A fast horizontal whip with motion blur carries you to the next clip.",
  keywords: ["whip", "pan", "swish", "motion blur", "fast"],
  params: [
    percent("blur", "Motion blur", 0.12, 0, 0.4),
    choice("direction", "Direction", "left", [
      ["left", "Left"],
      ["right", "Right"],
    ]),
  ],
  shader,
  uniforms: (p) => ({ uBlur: p.num("blur"), uSign: p.str("direction") === "left" ? 1 : -1 }),
});
