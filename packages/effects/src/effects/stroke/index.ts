import { defineEffect, vec4 } from "../../define.ts";
import { percent, px, choice, color, rgb } from "../../p.ts";
import stroke from "./stroke.frag.glsl?raw";

export const strokeEffect = defineEffect({
  id: "stroke",
  name: "Stroke",
  category: "Utility",
  description: "Outline the shape of the picture.",
  keywords: ["stroke", "outline", "border", "edge", "sticker"],
  params: [
    color("strokeColor", "Colour", rgb("#ffffff")),
    px("width", "Width", 6, 0.5, 80, { step: 0.5 }),
    choice("position", "Position", "outside", [
      ["outside", "Outside"],
      ["inside", "Inside"],
      ["center", "Centred"],
    ]),
    percent("opacity", "Opacity", 1, 0, 1),
  ],
  expand: (p) => Math.ceil(p.num("width")),
  passes: [
    {
      shader: stroke,
      uniforms: (p, c) => ({
        uColor: vec4(p.color("strokeColor")),
        uWidth: Math.max(
          0.5,
          p.num("width") * c.scale * (p.str("position") === "center" ? 0.5 : 1),
        ),
        uOpacity: p.num("opacity"),
        uPos: { int: p.choice("position") },
      }),
    },
  ],
});
