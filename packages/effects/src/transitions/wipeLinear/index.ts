import { defineTransition } from "../../define.ts";
import { dir } from "../../math.ts";
import { percent, degrees } from "../../p.ts";
import shader from "./wipeLinear.frag.glsl?raw";

export const wipeLinearTransition = defineTransition({
  id: "wipeLinear",
  name: "Wipe",
  description: "A straight edge sweeps across and reveals the next clip.",
  keywords: ["wipe", "reveal", "edge", "sweep", "linear wipe"],
  params: [
    degrees("angle", "Direction", 0, 0, 360),
    percent("softness", "Edge softness", 0.05, 0, 0.5),
  ],
  shader,
  uniforms: (p) => ({ uDir: dir(p.num("angle")), uSoftness: p.num("softness") }),
});
