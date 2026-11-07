import { defineEffect } from "../../define.ts";
import { dir } from "../../math.ts";
import { degrees, point } from "../../p.ts";
import mirror from "./mirror.frag.glsl?raw";

export const mirrorEffect = defineEffect({
  id: "mirror",
  name: "Mirror",
  category: "Distort",
  description: "Reflect one side of the picture onto the other.",
  keywords: ["mirror", "reflect", "flip", "symmetry"],
  params: [degrees("angle", "Angle", 0), point("center", "Centre", [0.5, 0.5])],
  passes: [
    {
      shader: mirror,
      uniforms: (p) => ({ uNormal: dir(p.num("angle")), uCenter: p.vec2("center") }),
    },
  ],
});
