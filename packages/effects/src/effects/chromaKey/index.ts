import { defineEffect } from "../../define.ts";
import { percent, color, rgb } from "../../p.ts";
import chromaKey from "./chromaKey.frag.glsl?raw";

export const chromaKeyEffect = defineEffect({
  id: "chromaKey",
  name: "Chroma key",
  category: "Keying",
  description: "Remove a colour (green screen) and clean up the colour spilling onto the subject.",
  keywords: ["key", "green screen", "chroma", "blue screen", "remove background", "matte"],
  params: [
    color("keyColor", "Key colour", rgb("#00ff00")),
    percent("tolerance", "Tolerance", 0.25, 0, 1),
    percent("softness", "Softness", 0.1, 0, 1),
    percent("spill", "Spill suppression", 0.6, 0, 1),
  ],
  passes: [
    {
      shader: chromaKey,
      uniforms: (p) => ({
        uKey: [p.color("keyColor")[0], p.color("keyColor")[1], p.color("keyColor")[2]],
        uTolerance: p.num("tolerance"),
        uSoftness: p.num("softness"),
        uSpill: p.num("spill"),
      }),
    },
  ],
});
