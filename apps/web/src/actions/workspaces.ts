import { ActionError } from "@lumacut/actions";
import * as z from "zod";
import { activeComposition, editingActions, type EditingContext } from "./editing.ts";

/** The built-in workspaces (SPEC §5.4): which side panel and which bottom dock. */
export const WORKSPACES = [
  {
    id: "edit",
    name: "Edit",
    sideTab: "inspector",
    bottom: "timeline",
    key: "Alt+1",
    photo: false,
    description: "Timeline first: cut, arrange and trim.",
  },
  {
    id: "motion",
    name: "Motion",
    sideTab: "inspector",
    bottom: "graph",
    key: "Alt+2",
    photo: false,
    description: "Keyframes and the graph editor for animation.",
  },
  {
    id: "color",
    name: "Color",
    sideTab: "scopes",
    bottom: "timeline",
    key: "Alt+3",
    photo: false,
    description: "Scopes beside the picture, for grading.",
  },
  {
    id: "audio",
    name: "Audio",
    sideTab: "inspector",
    bottom: "mixer",
    key: "Alt+4",
    photo: false,
    description: "The mixer: levels, pan, loudness.",
  },
  {
    id: "photo",
    name: "Photo",
    sideTab: "layers",
    bottom: "timeline",
    key: "Alt+5",
    photo: true,
    description: "Canvas and layers (photo projects).",
  },
] as const;

const available = (ctx: EditingContext) =>
  ctx.services.workspace !== undefined && activeComposition(ctx) !== undefined;

for (const w of WORKSPACES) {
  editingActions.register({
    id: `workspace.${w.id}`,
    title: `${w.name} workspace`,
    description: `${w.description} Switches to Pro mode.`,
    keywords: ["workspace", "layout", "panels", w.name.toLowerCase()],
    category: "Workspaces",
    shortcut: w.key,
    when: (ctx) => available(ctx) && (ctx.project?.kind === "photo") === w.photo,
    run: (ctx) => {
      ctx.services.editor.setMode?.("pro");
      ctx.services.workspace?.apply({ id: w.id, sideTab: w.sideTab, bottom: w.bottom });
      return undefined;
    },
  });
}

editingActions.register({
  id: "workspace.save",
  title: "Save workspace",
  description:
    "Remember the current arrangement of panels under a name, to switch back to it later.",
  keywords: ["workspace", "save layout", "panels", "custom layout"],
  category: "Workspaces",
  argsSchema: z.object({ name: z.string().min(1).max(40) }),
  when: available,
  run: (ctx, args) => {
    ctx.services.workspace?.save(args.name.trim());
    return undefined;
  },
});

editingActions.register({
  id: "workspace.use",
  title: "Switch to a saved workspace",
  description: "Show one of your saved panel arrangements (by name).",
  keywords: ["workspace", "layout", "saved", "switch"],
  category: "Workspaces",
  argsSchema: z.object({ name: z.string().min(1) }),
  when: (ctx) => available(ctx) && (ctx.services.workspace?.saved().length ?? 0) > 0,
  run: (ctx, args) => {
    const ws = ctx.services.workspace;
    const found = ws
      ?.saved()
      .find((w) => w.name.toLowerCase() === args.name.trim().toLowerCase() || w.id === args.name);
    if (ws === undefined || found === undefined)
      throw new ActionError(`There is no saved workspace “${args.name}”.`);
    ctx.services.editor.setMode?.("pro");
    ws.apply(found);
    return undefined;
  },
});

editingActions.register({
  id: "workspace.delete",
  title: "Delete a saved workspace",
  description: "Forget one of your saved panel arrangements.",
  keywords: ["workspace", "delete", "remove layout"],
  category: "Workspaces",
  argsSchema: z.object({ name: z.string().min(1) }),
  when: (ctx) => available(ctx) && (ctx.services.workspace?.saved().length ?? 0) > 0,
  run: (ctx, args) => {
    const ws = ctx.services.workspace;
    const found = ws
      ?.saved()
      .find((w) => w.name.toLowerCase() === args.name.trim().toLowerCase() || w.id === args.name);
    if (ws === undefined || found === undefined)
      throw new ActionError(`There is no saved workspace “${args.name}”.`);
    ws.remove(found.id);
    return undefined;
  },
});

editingActions.register({
  id: "help.tour",
  title: "Show the tour",
  description: "Replay the short guided tour of the editor.",
  keywords: ["tour", "help", "getting started", "onboarding", "guide", "tutorial"],
  category: "Help",
  when: (ctx) => ctx.services.workspace !== undefined,
  run: (ctx) => {
    ctx.services.workspace?.tour();
    return undefined;
  },
});
