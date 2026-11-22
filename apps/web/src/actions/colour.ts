import { BUILTIN_LUTS } from "@lumacut/engine/color";
import { neutralColor, type Op } from "@lumacut/schema";
import * as z from "zod";
import { placedClips } from "../timeline/clips.ts";
import { addFilterLayer } from "./effects.ts";
import { activeComposition, editingActions, type EditingContext } from "./editing.ts";

/** The unlocked picture clips in the selection: what a colour action applies to. */
function pictureTargets(ctx: EditingContext) {
  const comp = activeComposition(ctx);
  if (comp === undefined) return [];
  const wanted = new Set(ctx.selectedClipIds);
  return placedClips(comp).filter(
    (p) => wanted.has(p.clip.id) && !p.track.locked && p.track.kind === "visual",
  );
}

const available = (ctx: EditingContext): boolean => pictureTargets(ctx).length > 0;

editingActions.register({
  id: "color.reset",
  title: "Reset colour",
  description: "Remove all colour grading (exposure, curves, LUT…) from the selected clips.",
  keywords: ["color", "colour", "grade", "clear", "undo grade", "neutral"],
  category: "Colour",
  when: available,
  run: (ctx): Op[] =>
    pictureTargets(ctx).map(({ clip }) => ({
      type: "setProps",
      clipId: clip.id,
      props: { color: neutralColor() },
    })),
});

const lutIds = BUILTIN_LUTS.map((b) => b.id);

editingActions.register({
  id: "color.applyLut",
  title: "Apply a look",
  description:
    "Add a built-in colour look (LUT) as its own adjustment layer, directly above the selected clips and as long as them (the whole photo in a photo; 5 s from the playhead when nothing is selected); it changes everything below it. Looks: " +
    BUILTIN_LUTS.map((b) => `${b.id} (${b.name})`).join(", ") +
    ". Intensity is 0–100%. Lower the layer's opacity to soften it.",
  keywords: [
    "lut",
    "look",
    "filter",
    "preset",
    "grade",
    "teal",
    "orange",
    "noir",
    "sepia",
    "film",
    "instagram",
    "style",
    "adjustment layer",
  ],
  category: "Colour",
  icon: "lut",
  argsSchema: z.object({
    look: z.enum(lutIds as [string, ...string[]]),
    intensity: z.number().min(0).max(100).optional(),
  }),
  when: (ctx) => activeComposition(ctx) !== undefined,
  run: (ctx, args): Op[] => {
    const { look, intensity } = args;
    return addFilterLayer(ctx, { lookId: look, intensity: (intensity ?? 100) / 100 });
  },
});

editingActions.register({
  id: "color.removeLut",
  title: "Remove the look",
  description: "Remove the look-up table (LUT) from the selected clips.",
  keywords: ["lut", "look", "filter", "remove", "none"],
  category: "Colour",
  when: (ctx) => pictureTargets(ctx).some(({ clip }) => clip.color.lut !== undefined),
  run: (ctx): Op[] =>
    pictureTargets(ctx)
      .filter(({ clip }) => clip.color.lut !== undefined)
      .map(({ clip }) => {
        const { lut: _removed, ...rest } = clip.color;
        return { type: "setProps", clipId: clip.id, props: { color: rest } };
      }),
});
