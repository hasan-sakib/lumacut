import { defineTransition } from "../../define.ts";
import { percent, choice, point } from "../../p.ts";
import shader from "./wipeIris.frag.glsl?raw";

export const wipeIrisTransition = defineTransition({
  id: "wipeIris",
  name: "Iris wipe",
  description: "A growing shape opens onto the next clip.",
  keywords: ["wipe", "iris", "circle", "shape", "diamond", "box"],
  params: [
    choice("shape", "Shape", "circle", [
      ["circle", "Circle"],
      ["diamond", "Diamond"],
      ["box", "Box"],
    ]),
    point("center", "Centre", [0.5, 0.5]),
    percent("softness", "Edge softness", 0.05, 0, 0.5),
  ],
  shader,
  uniforms: (p) => ({
    uShape: { int: p.choice("shape") },
    uCenter: p.vec2("center"),
    uSoftness: p.num("softness"),
  }),
});
