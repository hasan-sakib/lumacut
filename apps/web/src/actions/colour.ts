import { ActionError } from "@lumacut/actions";
import { BUILTIN_LUTS } from "@lumacut/engine/color";
import { neutralColor, type Op } from "@lumacut/schema";
import * as z from "zod";
import { placedClips } from "../timeline/clips.ts";
import { lutName } from "../browser/items.ts";
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

const lutIds = new Set(BUILTIN_LUTS.map((b) => b.id));

editingActions.register({
  id: "color.applyLut",
  title: "Apply a look",
  description:
    "Add a colour look (LUT) as its own adjustment layer, directly above the selected clips and as long as them (the whole photo in a photo; 5 s from the playhead when nothing is selected); it changes everything below it. Use a built-in look: " +
    BUILTIN_LUTS.map((b) => `${b.id} (${b.name}, ${b.group})`).join(", ") +
    "; or one of your own .cube files by its name or id (one only in the library is added to the project). Intensity is 0–100%. Lower the layer's opacity to soften it.",
  keywords: [
    "lut",
    "look",
    "filter",
    "preset",
    "grade",
    "cube",
    "teal",
    "orange",
    "noir",
    "sepia",
    "film",
    "cinematic",
    "black and white",
    "instagram",
    "style",
    "adjustment layer",
  ],
  category: "Colour",
  icon: "lut",
  argsSchema: z.object({
    look: z
      .string()
      .min(1)
      .describe("A built-in look id (builtin:…), or the name or id of one of your .cube LUTs"),
    intensity: z.number().min(0).max(100).optional(),
  }),
  when: (ctx) => activeComposition(ctx) !== undefined,
  run: (ctx, args): Op[] => {
    const { look, intensity } = args;
    const amount = (intensity ?? 100) / 100;
    if (lutIds.has(look)) return addFilterLayer(ctx, { lookId: look, intensity: amount });
    if (look.startsWith("builtin:")) throw new ActionError(`There is no built-in look “${look}”.`);
    const project = ctx.project;
    if (project === null) throw new ActionError("Open a project first.");
    // One already in the project, else a ready one in the library (by id or name).
    const inProject = project.assets.find((a) => a.kind === "lut" && a.id === look);
    const found =
      inProject === undefined ? ctx.services.resolveAsset(look, "lut") : { asset: inProject };
    if ("error" in found) throw new ActionError(found.error);
    const asset = found.asset;
    const ops: Op[] = project.assets.some((a) => a.id === asset.id)
      ? []
      : [{ type: "addAsset", asset }];
    return [
      ...ops,
      ...addFilterLayer(ctx, { lookId: asset.id, intensity: amount, name: lutName(asset.name) }),
    ];
  },
});

editingActions.register({
  id: "lut.import",
  title: "Import a LUT (.cube)",
  description:
    "Choose .cube look-up tables from your computer. They upload to your library and appear as cards under Your LUTs in the looks, ready to apply as a layer.",
  keywords: ["lut", "cube", "import", "upload", "look", "grade", "my looks", "resolve", "premiere"],
  category: "Colour",
  icon: "upload",
  when: (ctx) => ctx.services.media !== undefined,
  run: (ctx) => {
    ctx.services.media?.importLuts();
    return undefined;
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
