import { applyOp } from "@lumacut/ops";
import type { Project } from "@lumacut/schema";
import { hex } from "@lumacut/templates";
import { newEffectInstance } from "../../inspector/effect-ops.ts";
import type { ThumbnailVariant } from "../templates/TemplateGallery.tsx";

const PALETTE: [string, string][] = [
  ["#f97316", "#db2777"],
  ["#0ea5e9", "#6366f1"],
  ["#10b981", "#0ea5e9"],
  ["#f59e0b", "#ef4444"],
  ["#8b5cf6", "#ec4899"],
  ["#14b8a6", "#84cc16"],
];

/**
 * A template with its empty media slots (grey stand-ins) filled by colour gradients, so the
 * landing page shows what a finished design looks like. Only for drawing: never saved or opened.
 */
function fillSlots(project: Project): Project {
  let next = project;
  let n = 0;
  for (const comp of project.compositions) {
    for (const track of comp.tracks) {
      for (const clip of track.clips) {
        if (clip.placeholder?.kind !== "media") continue;
        const [from, to] = PALETTE[n % PALETTE.length] ?? ["#0ea5e9", "#6366f1"];
        n += 1;
        const base = newEffectInstance("gradient", `demo${String(n)}`);
        next = applyOp(next, {
          type: "addEffect",
          clipId: clip.id,
          effect: {
            ...base,
            params: {
              ...base.params,
              colorA: hex(from),
              colorB: hex(to),
              angle: 30 + ((n * 50) % 150),
            },
          },
        }).project;
      }
    }
  }
  return next;
}

/** How the landing page draws templates: slots filled, caught a little past the middle. */
export const DEMO: ThumbnailVariant = { key: "demo", prepare: fillSlots, at: 0.6 };
