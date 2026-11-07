import { defineTransition } from "../../define.ts";
import { int, percent } from "../../p.ts";
import shader from "./glitch.frag.glsl?raw";

export const glitchTransition = defineTransition({
  id: "glitch",
  name: "Glitch",
  description: "Digital slices tear and flicker between the clips.",
  keywords: ["glitch", "digital", "tear", "rgb split", "distort", "datamosh"],
  params: [
    percent("intensity", "Intensity", 0.6, 0, 1),
    int("slices", "Slices", 14, 4, 60),
    int("seed", "Seed", 1, 0, 999),
  ],
  shader,
  uniforms: (p) => ({
    uIntensity: p.num("intensity"),
    uSlices: p.num("slices"),
    uSeed: { int: p.num("seed") },
  }),
});
