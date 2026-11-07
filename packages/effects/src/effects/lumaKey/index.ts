import { defineEffect } from "../../define.ts";
import { percent, bool, choice } from "../../p.ts";
import lumaKey from "./lumaKey.frag.glsl?raw";

export const lumaKeyEffect = defineEffect({
  id: "lumaKey",
  name: "Luma key",
  category: "Keying",
  description: "Make the darkest or brightest parts transparent.",
  keywords: ["key", "luma", "brightness key", "matte", "remove black", "remove white"],
  params: [
    percent("threshold", "Threshold", 0.2, 0, 1),
    percent("softness", "Softness", 0.1, 0, 1),
    choice("mode", "Remove", "darks", [
      ["darks", "Dark areas"],
      ["brights", "Bright areas"],
    ]),
    bool("invert", "Invert", false),
  ],
  passes: [
    {
      shader: lumaKey,
      uniforms: (p) => ({
        uThreshold: p.num("threshold"),
        uSoftness: p.num("softness"),
        uMode: { int: p.choice("mode") },
        uInvert: p.bool("invert"),
      }),
    },
  ],
});
