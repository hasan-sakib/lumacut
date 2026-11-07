import { defineTransition } from "../../define.ts";
import { radians } from "../../math.ts";
import { percent, degrees } from "../../p.ts";
import shader from "./spin.frag.glsl?raw";

export const spinTransition = defineTransition({
  id: "spin",
  name: "Spin",
  description: "The current clip spins away as the next spins in.",
  keywords: ["spin", "rotate", "twirl", "swirl"],
  params: [degrees("angle", "Turn", 180, -720, 720), percent("zoom", "Zoom", 0.5, 0, 2)],
  shader,
  uniforms: (p) => ({ uAngle: radians(p.num("angle")), uZoom: p.num("zoom") }),
});
