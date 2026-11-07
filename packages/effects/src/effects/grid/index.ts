import { defineEffect, vec4 } from "../../define.ts";
import { percent, px, color, rgb } from "../../p.ts";
import grid from "./grid.frag.glsl?raw";

export const gridEffect = defineEffect({
  id: "grid",
  name: "Grid",
  category: "Generate",
  description: "Draw a grid of lines over the picture.",
  keywords: ["grid", "lines", "graph paper", "overlay", "guides"],
  params: [
    px("cell", "Cell size", 64, 4, 600),
    px("line", "Line width", 2, 0.5, 20, { step: 0.5 }),
    color("lineColor", "Colour", rgb("#ffffff")),
    percent("opacity", "Opacity", 0.6, 0, 1),
    px("offsetX", "Offset X", 0, -600, 600),
    px("offsetY", "Offset Y", 0, -600, 600),
  ],
  passes: [
    {
      shader: grid,
      uniforms: (p, c) => ({
        uCell: Math.max(2, p.num("cell") * c.scale),
        uLine: Math.max(0.5, p.num("line") * c.scale),
        uColor: vec4(p.color("lineColor")),
        uOpacity: p.num("opacity"),
        uOffset: [p.num("offsetX") * c.scale, p.num("offsetY") * c.scale],
      }),
    },
  ],
});
