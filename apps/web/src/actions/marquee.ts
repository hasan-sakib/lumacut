import { ActionError } from "@lumacut/actions";
import type { Op } from "@lumacut/schema";
import * as z from "zod";
import { addMaskOp } from "../inspector/masks.ts";
import {
  allSelection,
  ellipseSelection,
  invertSelection,
  rectSelection,
  selectionToMask,
} from "../photo/selection.ts";
import { placedClips, type Placed } from "../timeline/clips.ts";
import { activeComposition, editingActions, type EditingContext } from "./editing.ts";

const hasPhoto = (ctx: EditingContext): boolean =>
  ctx.services.editor.photo !== undefined && activeComposition(ctx) !== undefined;
const hasSelection = (ctx: EditingContext): boolean => ctx.photo?.selection != null;

/** Unlocked picture layers in the clip selection. */
function layers(ctx: EditingContext): Placed[] {
  const comp = activeComposition(ctx);
  if (comp === undefined) return [];
  const wanted = new Set(ctx.selectedClipIds);
  return placedClips(comp).filter(
    (p) => wanted.has(p.clip.id) && !p.track.locked && p.track.kind === "visual",
  );
}

editingActions.register({
  id: "marquee.selectAll",
  title: "Select the whole canvas",
  description: "Make a selection covering the entire canvas (turn it into a mask, or crop to it).",
  keywords: ["select all", "marquee", "selection", "whole canvas", "everything"],
  category: "Selection",
  when: hasPhoto,
  run: (ctx) => {
    const comp = activeComposition(ctx);
    if (comp === undefined) throw new ActionError("Open a composition first.");
    ctx.services.editor.photo?.setSelection({
      path: allSelection(comp),
      feather: ctx.photo?.selection?.feather ?? 0,
      inverted: false,
    });
    return undefined;
  },
});

editingActions.register({
  id: "marquee.set",
  title: "Select a rectangle or ellipse",
  description:
    "Make a rectangular or elliptical selection from its top-left corner and size, in canvas pixels. (The marquee tools do this by dragging.)",
  keywords: ["selection", "marquee", "rectangle", "ellipse", "select area"],
  category: "Selection",
  argsSchema: z.object({
    shape: z.enum(["rect", "ellipse"]),
    x: z.number(),
    y: z.number(),
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  when: hasPhoto,
  run: (ctx, args) => {
    const { shape, x, y, width, height } = args;
    const a = { x, y };
    const b = { x: x + width, y: y + height };
    ctx.services.editor.photo?.setSelection({
      path: shape === "rect" ? rectSelection(a, b) : ellipseSelection(a, b),
      feather: ctx.photo?.selection?.feather ?? 0,
      inverted: false,
    });
    return undefined;
  },
});

editingActions.register({
  id: "marquee.clear",
  title: "Deselect",
  description: "Remove the current selection.",
  keywords: ["deselect", "clear selection", "marquee", "select none"],
  category: "Selection",
  shortcut: "Mod+Shift+D",
  when: (ctx) => hasPhoto(ctx) && hasSelection(ctx),
  run: (ctx) => {
    ctx.services.editor.photo?.setSelection(null);
    return undefined;
  },
});

editingActions.register({
  id: "marquee.invert",
  title: "Invert the selection",
  description: "Select everything except the current selection.",
  keywords: ["invert", "inverse", "selection", "swap", "marquee"],
  category: "Selection",
  shortcut: "Mod+Shift+I",
  when: (ctx) => hasPhoto(ctx) && hasSelection(ctx),
  run: (ctx) => {
    const selection = ctx.photo?.selection;
    if (selection != null) ctx.services.editor.photo?.setSelection(invertSelection(selection));
    return undefined;
  },
});

editingActions.register({
  id: "marquee.feather",
  title: "Feather the selection",
  description:
    "Soften the edge of the selection by this many canvas pixels (applied when it becomes a mask).",
  keywords: ["feather", "soften", "blur edge", "selection", "marquee"],
  category: "Selection",
  argsSchema: z.object({ pixels: z.number().min(0).max(1000) }),
  when: (ctx) => hasPhoto(ctx) && hasSelection(ctx),
  run: (ctx, args) => {
    const selection = ctx.photo?.selection;
    if (selection != null) {
      ctx.services.editor.photo?.setSelection({ ...selection, feather: args.pixels });
    }
    return undefined;
  },
});

editingActions.register({
  id: "marquee.toMask",
  title: "Selection to mask",
  description:
    "Turn the current selection into a layer mask on the selected layers: the layer shows only inside the selection (add), is cut out of it (subtract) or keeps the overlap with an existing mask (intersect). The selection's feather and invert carry over.",
  keywords: ["selection to mask", "layer mask", "mask", "cut out", "reveal", "marquee", "hide"],
  category: "Selection",
  argsSchema: z.object({ mode: z.enum(["add", "subtract", "intersect"]).optional() }),
  when: (ctx) => hasPhoto(ctx) && hasSelection(ctx) && layers(ctx).length > 0,
  run: (ctx, args): Op[] => {
    const comp = activeComposition(ctx);
    const project = ctx.project;
    const selection = ctx.photo?.selection;
    if (comp === undefined || project === null) throw new ActionError("Open a composition first.");
    if (selection == null) throw new ActionError("Make a selection first.");
    const targets = layers(ctx);
    if (targets.length === 0) throw new ActionError("Select a layer to mask.");
    return targets.map(({ clip }) =>
      addMaskOp(
        clip,
        selectionToMask(
          selection,
          clip,
          project,
          comp,
          ctx.playheadUs,
          ctx.services.newId(),
          args.mode ?? "add",
        ),
      ),
    );
  },
});
