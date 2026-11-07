import { defineEffect } from "../../define.ts";
import { num, px } from "../../p.ts";
import sharpen from "./sharpen.frag.glsl?raw";

export const sharpenEffect = defineEffect({
  id: "sharpen",
  name: "Sharpen",
  category: "Blur & sharpen",
  description: "Make edges and fine detail crisper.",
  keywords: ["sharpen", "crisp", "detail", "unsharp", "clarity"],
  params: [
    num("amount", "Amount", 1, 0, 5, { step: 0.05 }),
    px("radius", "Radius", 1, 0.5, 8, { step: 0.1 }),
  ],
  passes: [
    {
      shader: sharpen,
      uniforms: (p, c) => ({ uAmount: p.num("amount"), uRadius: p.num("radius") * c.scale }),
    },
  ],
});
