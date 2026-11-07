import { defineTransition } from "../../define.ts";
import { choice } from "../../p.ts";
import shader from "./push.frag.glsl?raw";

export const pushTransition = defineTransition({
  id: "push",
  name: "Push",
  description: "The next clip pushes the current one out of frame.",
  keywords: ["push", "shove", "move", "both"],
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
