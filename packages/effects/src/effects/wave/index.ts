import { defineEffect } from "../../define.ts";
import { dir, radians } from "../../math.ts";
import { px, degrees } from "../../p.ts";
import wave from "./wave.frag.glsl?raw";

export const waveEffect = defineEffect({
  id: "wave",
  name: "Wave",
  category: "Distort",
  description: "Make the picture undulate in a wave.",
  keywords: ["wave", "undulate", "sine", "flag", "wavy"],
  params: [
    px("amplitude", "Amplitude", 16, 0, 120),
    px("wavelength", "Wavelength", 100, 10, 600),
    degrees("angle", "Direction", 0),
    degrees("phase", "Phase", 0, -3600, 3600),
  ],
  expand: (p) => Math.ceil(p.num("amplitude")),
  passes: [
    {
      shader: wave,
      uniforms: (p, c) => ({
        uAmplitude: p.num("amplitude") * c.scale,
        uWavelength: Math.max(2, p.num("wavelength") * c.scale),
        uPhase: radians(p.num("phase")),
        uAxis: dir(p.num("angle")),
      }),
    },
  ],
});
