import { defineEffect } from "../../define.ts";
import { px } from "../../p.ts";
import { blurPasses } from "../../shared/blur.ts";

export const gaussianBlurEffect = defineEffect({
  id: "gaussianBlur",
  name: "Gaussian blur",
  category: "Blur & sharpen",
  description: "Soften the picture evenly in every direction.",
  keywords: ["blur", "soften", "smooth", "defocus"],
  params: [px("radius", "Radius", 10, 0, 250)],
  expand: (p) => Math.ceil(p.num("radius") * 1.5),
  passes: blurPasses((p) => p.num("radius") * 0.5),
});
