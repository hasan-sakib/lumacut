import { defineEffect } from "../../define.ts";
import { percent, px } from "../../p.ts";
import lensBlur from "./lensBlur.frag.glsl?raw";

export const lensBlurEffect = defineEffect({
  id: "lensBlur",
  name: "Lens blur",
  category: "Blur & sharpen",
  description: "Defocus with a round bokeh; bright spots bloom into discs.",
  keywords: ["blur", "bokeh", "defocus", "depth of field", "lens"],
  params: [px("radius", "Radius", 12, 0, 120), percent("highlights", "Highlight boost", 0.5, 0, 2)],
  expand: (p) => Math.ceil(p.num("radius")),
  passes: [
    {
      shader: lensBlur,
      uniforms: (p, c) => ({ uRadius: p.num("radius") * c.scale, uBoost: p.num("highlights") }),
    },
  ],
});
