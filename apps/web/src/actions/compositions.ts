import { ActionError } from "@lumacut/actions";
import type { Op } from "@lumacut/schema";
import * as z from "zod";
import { placedClips } from "../timeline/clips.ts";
import { activeComposition, editingActions, type EditingContext } from "./editing.ts";

function selected(ctx: EditingContext) {
  const comp = activeComposition(ctx);
  if (comp === undefined) return [];
  const wanted = new Set(ctx.selectedClipIds);
  return placedClips(comp).filter((p) => wanted.has(p.clip.id) && !p.track.locked);
}

editingActions.register({
  id: "clip.precompose",
  title: "Precompose",
  description:
    "Move the selected clips into a new nested composition and put one clip that plays it in their place, so they can be moved, scaled, masked and given effects as one.",
  keywords: [
    "precompose",
    "nest",
    "group",
    "compound clip",
    "nested composition",
    "pre-comp",
    "combine",
  ],
  category: "Edit",
  icon: "layers",
  argsSchema: z.object({
    name: z.string().min(1).optional().describe("Name of the new composition"),
  }),
  when: (ctx) => selected(ctx).some((p) => p.track.kind === "visual"),
  run: (ctx, args): Op => {
    const comp = activeComposition(ctx);
    const picked = selected(ctx);
    if (comp === undefined || picked.length === 0)
      throw new ActionError("Select the clips to precompose first.");
    const { name } = args;
    return {
      type: "precompose",
      compositionId: comp.id,
      clipIds: picked.map((p) => p.clip.id),
      newCompositionId: ctx.services.newId(),
      newCompositionName: name ?? `Precomp ${String(ctx.project?.compositions.length ?? 1)}`,
      newClipId: ctx.services.newId(),
    };
  },
});

editingActions.register({
  id: "composition.open",
  title: "Open a nested composition",
  description:
    "Edit the composition inside the selected nested-composition clip (or the one named by `composition`). Use “Go back up” to return.",
  keywords: ["open", "enter", "nested", "precomp", "edit inside", "composition", "dive in"],
  category: "Edit",
  argsSchema: z.object({
    composition: z.string().optional().describe("Composition id (default: the selected clip's)"),
  }),
  when: (ctx) =>
    ctx.services.editor.openComposition !== undefined &&
    selected(ctx).some((p) => p.clip.type === "composition"),
  run: (ctx, args) => {
    const { composition } = args;
    const target =
      composition ?? selected(ctx).find((p) => p.clip.type === "composition")?.clip.compositionId;
    if (target === undefined) throw new ActionError("Select a nested-composition clip first.");
    if (!ctx.project?.compositions.some((c) => c.id === target)) {
      throw new ActionError(`There is no composition "${target}".`);
    }
    ctx.services.editor.openComposition?.(target);
    return undefined;
  },
});

editingActions.register({
  id: "composition.close",
  title: "Go back up",
  description:
    "Leave the nested composition you are editing and return to the one that contains it.",
  keywords: ["back", "up", "exit", "close composition", "parent", "return"],
  category: "Edit",
  shortcut: "Alt+ArrowUp",
  when: (ctx) =>
    ctx.services.editor.closeComposition !== undefined &&
    ctx.project !== null &&
    ctx.compositionId !== ctx.project.mainCompositionId,
  run: (ctx) => {
    ctx.services.editor.closeComposition?.();
    return undefined;
  },
});
