import { defineEffect, vec4 } from "../../define.ts";
import { num, percent, color, rgb } from "../../p.ts";
import letterbox from "./letterbox.frag.glsl?raw";

export const letterboxEffect = defineEffect({
  id: "letterbox",
  name: "Letterbox",
  category: "Cinematic",
  description: "Add cinema bars to give the picture a widescreen shape.",
  keywords: ["letterbox", "bars", "cinema", "widescreen", "2.39", "black bars"],
  params: [
    num("aspect", "Aspect ratio", 2.39, 1, 4, { step: 0.01 }),
    color("barColor", "Bar colour", rgb("#000000")),
    percent("opacity", "Opacity", 1, 0, 1),
  ],
  passes: [
    {
      shader: letterbox,
      uniforms: (p) => ({
        uAspect: p.num("aspect"),
        uColor: vec4(p.color("barColor")),
        uOpacity: p.num("opacity"),
      }),
    },
  ],
});
