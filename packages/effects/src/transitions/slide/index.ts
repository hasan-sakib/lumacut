import { defineTransition } from "../../define.ts";
import { choice } from "../../p.ts";
import shader from "./slide.frag.glsl?raw";

export const slideTransition = defineTransition({
  id: "slide",
  name: "Slide",
  description: "The next clip slides in over the current one.",
  keywords: ["slide", "move", "cover", "over"],
  params: [
    choice("direction", "Direction", "left", [
      ["left", "From the right, moving left"],
      ["right", "From the left, moving right"],
      ["up", "From the bottom, moving up"],
      ["down", "From the top, moving down"],
    ]),
  ],
  shader,
  uniforms: (p) => ({ uDirection: { int: p.choice("direction") } }),
});
