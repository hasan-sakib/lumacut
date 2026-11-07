import { defineEffect } from "../../define.ts";
import { dir } from "../../math.ts";
import { px, degrees } from "../../p.ts";
import directionalBlur from "./directionalBlur.frag.glsl?raw";

export const directionalBlurEffect = defineEffect({
  id: "directionalBlur",
  name: "Directional blur",
  category: "Blur & sharpen",
  description: "Smear the picture along a direction, like a camera pan.",
  keywords: ["blur", "motion", "smear", "pan", "streak"],
  params: [px("length", "Length", 40, 0, 400), degrees("angle", "Angle", 0)],
  expand: (p) => Math.ceil(p.num("length") / 2),
  passes: [
    {
      shader: directionalBlur,
      uniforms: (p, c) => ({ uDir: dir(p.num("angle")), uLength: p.num("length") * c.scale }),
    },
  ],
});
