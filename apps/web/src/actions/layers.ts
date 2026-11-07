import { ActionError } from "@lumacut/actions";
import { createClip, neutralColor, type Color, type Op } from "@lumacut/schema";
import * as z from "zod";
import { DEFAULT_IMAGE_US, activeComposition, editingActions, trackFor } from "./editing.ts";

const hexColor = (hex: string): Color | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (m?.[1] === undefined) return null;
  const n = Number.parseInt(m[1], 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a: 1 };
};

editingActions.register({
  id: "layer.addSolid",
  title: "Add a colour layer",
  description:
    "Add a flat colour clip at the playhead (a background, or a base for gradients, noise and other generated effects).",
  keywords: ["solid", "colour", "color", "background", "fill", "layer", "generate"],
  category: "Timeline",
  argsSchema: z.object({
    color: z.string().optional().describe("Hex colour such as #202020 (default dark grey)"),
    seconds: z.number().min(0.1).max(3600).optional().describe("Length in seconds (default 5)"),
  }),
  when: (ctx) => activeComposition(ctx) !== undefined,
  run: (ctx, args): Op[] => {
    const comp = activeComposition(ctx);
    if (comp === undefined) throw new ActionError("Open a composition first.");
    const { color, seconds } = args;
    const parsed = hexColor(color ?? "#202020");
    if (parsed === null)
      throw new ActionError(`“${String(color)}” isn't a hex colour like #202020.`);
    const length = Math.round((seconds ?? DEFAULT_IMAGE_US / 1_000_000) * 1_000_000);
    const ops: Op[] = [];
    const trackId = trackFor(ctx, comp, "visual", ctx.playheadUs, ctx.playheadUs + length, ops);
    ops.push({
      type: "addClip",
      trackId,
      clip: createClip({
        id: ctx.services.newId(),
        type: "solid",
        startUs: ctx.playheadUs,
        inUs: 0,
        outUs: length,
        solid: { color: parsed },
        color: neutralColor(),
      }),
    });
    return ops;
  },
});

editingActions.register({
  id: "layer.addAdjustment",
  title: "Add an adjustment layer",
  description:
    "Add a clip whose colour grade and effects apply to everything underneath it, for as long as it lasts.",
  keywords: ["adjustment", "adjust", "layer", "grade everything", "global", "effect layer"],
  category: "Timeline",
  argsSchema: z.object({
    seconds: z.number().min(0.1).max(3600).optional().describe("Length in seconds (default 5)"),
  }),
  when: (ctx) => activeComposition(ctx) !== undefined,
  run: (ctx, args): Op[] => {
    const comp = activeComposition(ctx);
    if (comp === undefined) throw new ActionError("Open a composition first.");
    const { seconds } = args;
    const length = Math.round((seconds ?? DEFAULT_IMAGE_US / 1_000_000) * 1_000_000);
    const ops: Op[] = [];
    const trackId = trackFor(ctx, comp, "visual", ctx.playheadUs, ctx.playheadUs + length, ops);
    ops.push({
      type: "addClip",
      trackId,
      clip: createClip({
        id: ctx.services.newId(),
        type: "adjustment",
        startUs: ctx.playheadUs,
        inUs: 0,
        outUs: length,
      }),
    });
    return ops;
  },
});
