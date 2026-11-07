import { defineEffect, vec4 } from "../../define.ts";
import { dir } from "../../math.ts";
import { percent, px, degrees, color, rgb } from "../../p.ts";
import { blurPasses } from "../../shared/blur.ts";
import dropShadow from "./dropShadow.frag.glsl?raw";

export const dropShadowEffect = defineEffect({
  id: "dropShadow",
  name: "Drop shadow",
  category: "Utility",
  description: "Cast a soft shadow behind the shape of the picture.",
  keywords: ["shadow", "drop shadow", "depth", "lift", "cast"],
  params: [
    color("shadowColor", "Colour", rgb("#000000")),
    percent("opacity", "Opacity", 0.5, 0, 1),
    px("distance", "Distance", 12, 0, 200),
    degrees("angle", "Direction", 135, 0, 360),
    px("softness", "Softness", 12, 0, 120),
  ],
  expand: (p) => Math.ceil(p.num("distance") + p.num("softness") * 1.5),
  passes: [
    ...blurPasses((p) => p.num("softness") * 0.5),
    {
      shader: dropShadow,
      uniforms: (p, c) => {
        const d = dir(p.num("angle"));
        return {
          uColor: vec4(p.color("shadowColor")),
          uOpacity: p.num("opacity"),
          uOffset: [d[0] * p.num("distance") * c.scale, d[1] * p.num("distance") * c.scale],
        };
      },
    },
  ],
});
