import { ActionError } from "@lumacut/actions";
import type { Clip, Op, PlaceholderInfo } from "@lumacut/schema";
import { projectSlots, replaceMediaOps, setColorOps, setTextOps } from "@lumacut/templates";
import * as z from "zod";
import { placedClips } from "../timeline/clips.ts";
import { parseHex } from "./paint.ts";
import { activeComposition, editingActions, type EditingContext } from "./editing.ts";

const slotsOf = (ctx: EditingContext) => (ctx.project === null ? [] : projectSlots(ctx.project));

function needSlot(ctx: EditingContext, slotId: string, kind: PlaceholderInfo["kind"]) {
  const slot = slotsOf(ctx).find(
    (s) => s.slotId === slotId || s.label.toLowerCase() === slotId.toLowerCase(),
  );
  if (slot === undefined) throw new ActionError(`There is no slot “${slotId}” in this project.`);
  if (slot.kind !== kind) throw new ActionError(`“${slot.label}” is a ${slot.kind} slot.`);
  return slot;
}

const hasSlots = (kind: PlaceholderInfo["kind"]) => (ctx: EditingContext) =>
  slotsOf(ctx).some((s) => s.kind === kind);

editingActions.register({
  id: "template.replaceMedia",
  title: "Put media in a template slot",
  description:
    "Fill a media slot of a template with a photo or video from your library. Its motion, effects and timing stay; the picture is fitted to cover the slot.",
  keywords: ["template", "replace media", "slot", "placeholder", "swap photo", "fill"],
  category: "Templates",
  icon: "image",
  argsSchema: z.object({
    slot: z.string().describe("Slot id or label, e.g. “Clip 1”"),
    asset: z.string().describe("Library asset name (or part of it) or id"),
  }),
  when: hasSlots("media"),
  run: (ctx, args): Op[] => {
    const project = ctx.project;
    if (project === null) throw new ActionError("Open a project first.");
    const slot = needSlot(ctx, args.slot, "media");
    const found = ctx.services.resolveAsset(args.asset);
    if ("error" in found) throw new ActionError(found.error);
    if (found.asset.kind !== "image" && found.asset.kind !== "video") {
      throw new ActionError("A media slot takes a photo or a video.");
    }
    const ops = replaceMediaOps(project, slot.compositionId, slot.clip, found.asset);
    if (ops.length === 0) throw new ActionError("That media can't go in this slot.");
    ctx.services.markStep?.("replace");
    return ops;
  },
});

editingActions.register({
  id: "template.setText",
  title: "Change a template text",
  description:
    "Type new words for a text slot of a template (its look and animation stay). Caption slots are re-timed evenly.",
  keywords: ["template", "text", "title", "slot", "words", "edit text"],
  category: "Templates",
  icon: "text",
  argsSchema: z.object({ slot: z.string(), text: z.string() }),
  when: hasSlots("text"),
  run: (ctx, args): Op[] => setTextOps(needSlot(ctx, args.slot, "text").clip, args.text),
});

editingActions.register({
  id: "template.setColor",
  title: "Change a template colour",
  description: "Pick a new colour for a colour slot of a template (backgrounds, bars, accents).",
  keywords: ["template", "colour", "color", "slot", "brand colour", "accent"],
  category: "Templates",
  argsSchema: z.object({
    slot: z.string(),
    color: z.string().describe("Hex colour such as #ff3b6b"),
  }),
  when: hasSlots("color"),
  run: (ctx, args): Op[] => {
    const color = parseHex(args.color);
    if (color === null) throw new ActionError(`“${args.color}” isn't a hex colour like #ff3b6b.`);
    return setColorOps(needSlot(ctx, args.slot, "color").clip, color);
  },
});

/** Unlocked selected clips. */
function selected(ctx: EditingContext): Clip[] {
  const comp = activeComposition(ctx);
  if (comp === undefined) return [];
  const wanted = new Set(ctx.selectedClipIds);
  return placedClips(comp)
    .filter((p) => wanted.has(p.clip.id) && !p.track.locked)
    .map((p) => p.clip);
}

const kindFor = (clip: Clip): PlaceholderInfo["kind"] =>
  clip.type === "text" || clip.type === "caption"
    ? "text"
    : clip.type === "shape"
      ? "color"
      : "media";

editingActions.register({
  id: "clip.markPlaceholder",
  title: "Make a template slot",
  description:
    "Mark the selected clips as slots someone fills in when they use your template: media (a photo or video), text, or a colour.",
  keywords: ["template", "slot", "placeholder", "make template", "replaceable"],
  category: "Templates",
  argsSchema: z.object({
    label: z.string().min(1).max(60).optional().describe("What the slot is for, e.g. “Logo”"),
    kind: z.enum(["media", "text", "color"]).optional(),
  }),
  when: (ctx) => selected(ctx).length > 0,
  run: (ctx, args): Op[] => {
    const clips = selected(ctx);
    const taken = new Set(slotsOf(ctx).map((s) => s.slotId));
    return clips.map((clip, i) => {
      const kind = args.kind ?? kindFor(clip);
      const label =
        args.label ??
        `${kind === "media" ? "Media" : kind === "text" ? "Text" : "Colour"} ${String(taken.size + i + 1)}`;
      let slotId =
        label
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || "slot";
      while (taken.has(slotId)) slotId = `${slotId}-2`;
      taken.add(slotId);
      return {
        type: "setPlaceholder" as const,
        clipId: clip.id,
        placeholder: { slotId, kind, label },
      };
    });
  },
});

editingActions.register({
  id: "clip.clearPlaceholder",
  title: "Stop being a template slot",
  description: "Unmark the selected clips as template slots.",
  keywords: ["template", "slot", "placeholder", "remove slot"],
  category: "Templates",
  when: (ctx) => selected(ctx).some((c) => c.placeholder !== undefined),
  run: (ctx): Op[] =>
    selected(ctx)
      .filter((c) => c.placeholder !== undefined)
      .map((clip) => ({ type: "setPlaceholder" as const, clipId: clip.id })),
});

editingActions.register({
  id: "template.saveAs",
  title: "Save as template",
  description:
    "Save this project as one of your templates. Mark the clips people should fill in as slots first (Make a template slot).",
  keywords: ["template", "save template", "reuse", "make template", "preset project"],
  category: "Templates",
  icon: "layers",
  argsSchema: z.object({
    name: z.string().min(1).max(255),
    category: z
      .enum(["reels", "intros", "lowerThirds", "slideshows", "quoteCards", "mine"])
      .optional(),
    description: z.string().max(1000).optional(),
  }),
  when: (ctx) => ctx.project !== null && ctx.services.templates !== undefined,
  run: async (ctx, args) => {
    if (slotsOf(ctx).length === 0) {
      throw new ActionError("Mark at least one clip as a slot first (Make a template slot).");
    }
    try {
      await ctx.services.templates?.save(
        args.name,
        args.category ?? "mine",
        args.description ?? "",
      );
    } catch (error) {
      throw new ActionError(error instanceof Error ? error.message : "Couldn't save the template.");
    }
    return undefined;
  },
});
