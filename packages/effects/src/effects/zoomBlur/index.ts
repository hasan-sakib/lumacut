import { defineEffect } from "../../define.ts";
import { percent, point } from "../../p.ts";
import zoomBlur from "./zoomBlur.frag.glsl?raw";

export const zoomBlurEffect = defineEffect({
  id: "zoomBlur",
  name: "Zoom blur",
  category: "Blur & sharpen",
  description: "Streak the picture towards a point, like a fast zoom.",
  keywords: ["blur", "zoom", "rush", "burst", "radial"],
  params: [percent("amount", "Amount", 0.15, 0, 0.6), point("center", "Centre", [0.5, 0.5])],
  passes: [
    {
      shader: zoomBlur,
      uniforms: (p) => ({ uAmount: p.num("amount"), uCenter: p.vec2("center") }),
    },
  ],
});
