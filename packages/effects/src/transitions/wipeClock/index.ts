import { defineTransition } from "../../define.ts";
import { radians } from "../../math.ts";
import { percent, degrees, bool } from "../../p.ts";
import shader from "./wipeClock.frag.glsl?raw";

export const wipeClockTransition = defineTransition({
  id: "wipeClock",
  name: "Clock wipe",
  description: "A hand sweeps around and reveals the next clip.",
  keywords: ["wipe", "clock", "radial", "sweep", "pie"],
  params: [
    degrees("start", "Start angle", -90, -360, 360),
    percent("softness", "Edge softness", 0.02, 0, 0.3),
    bool("clockwise", "Clockwise", true),
  ],
  shader,
  uniforms: (p) => ({
    uStart: radians(p.num("start")),
    uSoftness: p.num("softness"),
    uClockwise: p.bool("clockwise"),
  }),
});
