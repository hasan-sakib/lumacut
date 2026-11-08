import { ActionError } from "@lumacut/actions";
import { BUILTIN_LUTS } from "@lumacut/engine/color";
import {
  BlendMode,
  createClip,
  createTrack,
  neutralColor,
  type Clip,
  type Composition,
  type Op,
  type Track,
} from "@lumacut/schema";
import * as z from "zod";
import { addLayerOps } from "../photo/layers.ts";
import {
  DEFAULT_IMAGE_US,
  activeComposition,
  editingActions,
  type EditingContext,
} from "./editing.ts";

const LOOK_IDS = BUILTIN_LUTS.map((l) => l.id) as [string, ...string[]];

/** The layers an action acts on: the one named by `trackId`, else the layers of the selected clips. */
function layersOf(ctx: EditingContext, trackId?: string): Track[] {
  const comp = activeComposition(ctx);
  if (comp === undefined) return [];
  if (trackId !== undefined) return comp.tracks.filter((t) => t.id === trackId);
  const wanted = new Set(ctx.selectedClipIds);
  return comp.tracks.filter(
    (t) =>
      t.kind === "visual" &&
      (t.id === ctx.selectedTrackId || t.clips.some((c) => wanted.has(c.id))),
  );
}

const TrackArg = z.object({
  trackId: z.string().optional().describe("The layer (default: the selected layers)"),
});

/** Layer actions can name their layer (`trackId`), so they only need a composition to be open. */
const available = (ctx: EditingContext): boolean => activeComposition(ctx) !== undefined;

function needLayers(ctx: EditingContext, trackId?: string): { comp: Composition; layers: Track[] } {
  const comp = activeComposition(ctx);
  if (comp === undefined) throw new ActionError("Open a composition first.");
  const layers = layersOf(ctx, trackId);
  if (layers.length === 0) throw new ActionError("Select a layer first.");
  return { comp, layers };
}

function move(
  id: string,
  title: string,
  shortcut: string | undefined,
  where: "up" | "down" | "top" | "bottom",
): void {
  editingActions.register({
    id,
    title,
    description: `${title}: change where the selected layers sit in the stack.`,
    keywords: [
      "layer",
      "order",
      "stack",
      "arrange",
      "reorder",
      where === "up" || where === "top" ? "forward" : "back",
    ],
    category: "Layers",
    icon: where === "up" || where === "top" ? "chevronUp" : "chevronDown",
    ...(shortcut === undefined ? {} : { shortcut }),
    argsSchema: TrackArg,
    when: available,
    run: (ctx, args): Op[] => {
      const { comp, layers } = needLayers(ctx, args.trackId);
      const order = comp.tracks.map((t) => t.id);
      const ids = new Set(layers.map((l) => l.id));
      // Work on the stack from the end that moves first so layers don't jump over each other.
      const sequence = [...layers].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
      if (where === "up" || where === "top") sequence.reverse();
      const ops: Op[] = [];
      const simulated = [...order];
      for (const layer of sequence) {
        const from = simulated.indexOf(layer.id);
        let to: number;
        if (where === "top") to = simulated.length - 1;
        else if (where === "bottom") to = 0;
        else if (where === "up") {
          to = from + 1;
          while (to < simulated.length && ids.has(simulated[to] ?? "")) to += 1;
          to = Math.min(to, simulated.length - 1);
        } else {
          to = from - 1;
          while (to > 0 && ids.has(simulated[to] ?? "")) to -= 1;
          to = Math.max(to, 0);
        }
        if (to === from) continue;
        simulated.splice(from, 1);
        simulated.splice(to, 0, layer.id);
        ops.push({ type: "reorderTrack", compositionId: comp.id, trackId: layer.id, toIndex: to });
      }
      return ops;
    },
  });
}
move("layer.moveUp", "Bring layer forward", "Mod+]", "up");
move("layer.moveDown", "Send layer backward", "Mod+[", "down");
move("layer.moveToTop", "Bring layer to front", "Mod+Shift+]", "top");
move("layer.moveToBottom", "Send layer to back", "Mod+Shift+[", "bottom");

editingActions.register({
  id: "layer.duplicate",
  icon: "copy",
  title: "Duplicate layer",
  description: "Copy the selected layers; each copy goes just above its original.",
  keywords: ["layer", "duplicate", "copy", "clone"],
  category: "Layers",
  shortcut: "Mod+J",
  argsSchema: TrackArg,
  when: available,
  run: (ctx, args): Op[] => {
    const { comp, layers } = needLayers(ctx, args.trackId);
    const ops: Op[] = [];
    let inserted = 0;
    const copies: string[] = [];
    for (const layer of layers) {
      const index = comp.tracks.findIndex((t) => t.id === layer.id) + 1 + inserted;
      const trackId = ctx.services.newId();
      ops.push({
        type: "addTrack",
        compositionId: comp.id,
        track: createTrack({
          id: trackId,
          kind: layer.kind,
          name: `${layer.name} copy`,
        }),
        index,
      });
      inserted += 1;
      for (const clip of layer.clips) {
        const { linkId: _linked, ...rest } = clip;
        const id = ctx.services.newId();
        copies.push(id);
        ops.push({ type: "addClip", trackId, clip: { ...structuredClone(rest), id } });
      }
    }
    ctx.services.editor.selectClips(copies);
    return ops;
  },
});

editingActions.register({
  id: "layer.delete",
  icon: "trash",
  title: "Delete layer",
  description: "Remove the selected layers (undoable).",
  keywords: ["layer", "delete", "remove", "trash"],
  category: "Layers",
  shortcut: "Mod+Backspace",
  argsSchema: TrackArg,
  when: available,
  run: (ctx, args): Op[] => {
    const { comp, layers } = needLayers(ctx, args.trackId);
    if (layers.some((l) => l.locked)) throw new ActionError("Unlock the layer before deleting it.");
    ctx.services.editor.selectClips([]);
    return layers.map((l) => ({ type: "removeTrack", compositionId: comp.id, trackId: l.id }));
  },
});

editingActions.register({
  id: "layer.rename",
  icon: "text",
  title: "Rename layer",
  description: "Give the selected layer a new name.",
  keywords: ["layer", "rename", "name", "label"],
  category: "Layers",
  argsSchema: z.object({ name: z.string().min(1).max(120), trackId: z.string().optional() }),
  when: available,
  run: (ctx, args): Op[] => {
    const { layers } = needLayers(ctx, args.trackId);
    return layers.map((l) => ({
      type: "setTrackProps",
      trackId: l.id,
      props: { name: args.name },
    }));
  },
});

function toggle(
  id: string,
  title: string,
  description: string,
  keywords: string[],
  field: "hidden" | "locked",
): void {
  editingActions.register({
    id,
    title,
    description,
    keywords,
    category: "Layers",
    icon: field === "hidden" ? "eye" : "lock",
    argsSchema: z.object({
      trackId: z.string().optional().describe("The layer (default: the selected layers)"),
      value: z.boolean().optional().describe("Set to this instead of switching"),
    }),
    when: available,
    run: (ctx, args): Op[] => {
      const { layers } = needLayers(ctx, args.trackId);
      return layers.map((l) => ({
        type: "setTrackProps",
        trackId: l.id,
        props: { [field]: args.value ?? !l[field] },
      }));
    },
  });
}
toggle(
  "layer.toggleHidden",
  "Show or hide layer",
  "Hide the selected layers from the picture (and the export), or show them again.",
  ["layer", "visibility", "hide", "show", "eye"],
  "hidden",
);
toggle(
  "layer.toggleLocked",
  "Lock or unlock layer",
  "Lock the selected layers so they can't be edited, or unlock them.",
  ["layer", "lock", "unlock", "protect"],
  "locked",
);

/** The clips on the layers (one clip per photo layer, but groups of several are fine). */
function layerClips(layers: readonly Track[]): Clip[] {
  return layers.flatMap((l) => l.clips);
}

editingActions.register({
  id: "layer.setOpacity",
  icon: "effect",
  title: "Set layer opacity",
  description: "Set how opaque the selected layers are (0 = invisible … 1 = solid).",
  keywords: ["layer", "opacity", "transparency", "fade", "alpha"],
  category: "Layers",
  argsSchema: z.object({ opacity: z.number().min(0).max(1), trackId: z.string().optional() }),
  when: available,
  run: (ctx, args): Op[] =>
    layerClips(needLayers(ctx, args.trackId).layers).map((clip) => ({
      type: "setProps",
      clipId: clip.id,
      props: { opacity: args.opacity },
    })),
});

editingActions.register({
  id: "layer.setBlend",
  icon: "effect",
  title: "Set layer blend mode",
  description:
    "Choose how the selected layers mix with the ones below (multiply, screen, overlay…).",
  keywords: ["layer", "blend", "blending", "multiply", "screen", "overlay", "mix"],
  category: "Layers",
  argsSchema: z.object({ mode: BlendMode, trackId: z.string().optional() }),
  when: available,
  run: (ctx, args): Op[] =>
    layerClips(needLayers(ctx, args.trackId).layers).map((clip) => ({
      type: "setProps",
      clipId: clip.id,
      props: { blendMode: args.mode },
    })),
});

editingActions.register({
  id: "layer.group",
  icon: "group",
  title: "Group layers",
  description:
    "Put the selected layers into one group (a nested composition) that can be moved, masked, faded and given effects as one. Double-click the group to edit what is inside.",
  keywords: ["group", "layers", "nest", "folder", "combine", "precompose"],
  category: "Layers",
  shortcut: "Mod+G",
  argsSchema: z.object({ name: z.string().min(1).optional() }),
  when: (ctx) => layersOf(ctx).some((l) => l.clips.length > 0),
  run: (ctx, args): Op[] => {
    const { comp, layers } = needLayers(ctx);
    if (layers.some((l) => l.locked)) throw new ActionError("Unlock the layers before grouping.");
    const clipIds = layerClips(layers).map((c) => c.id);
    if (clipIds.length === 0) throw new ActionError("Select layers that have something on them.");
    const newClipId = ctx.services.newId();
    ctx.services.editor.selectClips([newClipId]);
    // The group takes the lowest of the layers; the others are left empty, so they go.
    const order = comp.tracks.map((t) => t.id);
    const [host, ...others] = [...layers]
      .filter((l) => l.clips.length > 0)
      .sort((x, y) => order.indexOf(x.id) - order.indexOf(y.id));
    const emptied = others.filter((l) => l.id !== host?.id);
    const group: Op = {
      type: "precompose",
      compositionId: comp.id,
      clipIds,
      newCompositionId: ctx.services.newId(),
      newCompositionName: args.name ?? `Group ${String(ctx.project?.compositions.length ?? 1)}`,
      newClipId,
    };
    return [
      group,
      ...emptied.map((l): Op => ({ type: "removeTrack", compositionId: comp.id, trackId: l.id })),
    ];
  },
});

const isPlain = (c: Clip): boolean =>
  c.opacity === 1 &&
  c.blendMode === "normal" &&
  c.effects.length === 0 &&
  c.masks.length === 0 &&
  c.trackMatte === undefined &&
  Object.keys(c.keyframes).length === 0 &&
  c.transform.x === 0 &&
  c.transform.y === 0 &&
  c.transform.scaleX === 1 &&
  c.transform.scaleY === 1 &&
  c.transform.rotation === 0 &&
  c.transform.skew === 0 &&
  c.transform.anchorX === 0 &&
  c.transform.anchorY === 0;

editingActions.register({
  id: "layer.ungroup",
  icon: "unlink",
  title: "Ungroup layers",
  description:
    "Take the layers out of the selected group and put them back in the stack. Works for groups that haven't been moved, scaled, masked, faded or given effects (undo those first, or keep the group).",
  keywords: ["ungroup", "group", "release", "unnest", "layers", "expand"],
  category: "Layers",
  shortcut: "Mod+Shift+G",
  when: (ctx) => layerClips(layersOf(ctx)).some((c) => c.type === "composition"),
  run: (ctx): Op[] => {
    const comp = activeComposition(ctx);
    const project = ctx.project;
    if (comp === undefined || project === null) throw new ActionError("Open a composition first.");
    const { layers } = needLayers(ctx);
    const groups = layerClips(layers).filter((c) => c.type === "composition");
    if (groups.length === 0) throw new ActionError("Select a group first.");
    const ops: Op[] = [];
    const released: string[] = [];
    for (const group of groups) {
      const child = project.compositions.find((c) => c.id === group.compositionId);
      if (child === undefined) throw new ActionError("That group's contents are missing.");
      if (!isPlain(group)) {
        throw new ActionError(
          "This group was moved, scaled, masked, faded or given effects, so ungrouping would change how it looks. Undo those changes first.",
        );
      }
      if (child.width !== comp.width || child.height !== comp.height) {
        throw new ActionError(
          "This group's canvas differs from this one, so it can't be released.",
        );
      }
      const at = comp.tracks.findIndex((t) => t.clips.some((c) => c.id === group.id));
      // The group's own layer goes away; its contents take its place, bottom layer first.
      const own = comp.tracks[at];
      if (own === undefined) continue;
      ops.push({ type: "removeTrack", compositionId: comp.id, trackId: own.id });
      let index = at;
      for (const inner of child.tracks) {
        if (inner.kind !== "visual") continue;
        const trackId = ctx.services.newId();
        ops.push({
          type: "addTrack",
          compositionId: comp.id,
          track: createTrack({ id: trackId, kind: "visual", name: inner.name }),
          index,
        });
        for (const clip of inner.clips) {
          const id = ctx.services.newId();
          released.push(id);
          ops.push({
            type: "addClip",
            trackId,
            clip: { ...structuredClone(clip), id, startUs: group.startUs + clip.startUs },
          });
        }
        index += 1;
      }
      const stillUsed = project.compositions.some((c) =>
        c.tracks.some((t) =>
          t.clips.some(
            (k) => k.type === "composition" && k.compositionId === child.id && k.id !== group.id,
          ),
        ),
      );
      if (!stillUsed) ops.push({ type: "removeComposition", compositionId: child.id });
    }
    ctx.services.editor.selectClips(released);
    return ops;
  },
});

editingActions.register({
  id: "layer.moveTo",
  icon: "layers",
  title: "Move layer to a position",
  description:
    "Put a layer at a place in the stack (0 is the bottom layer). The Layers panel calls this when a layer is dragged.",
  keywords: ["layer", "reorder", "drag", "position", "stack", "order"],
  category: "Layers",
  argsSchema: z.object({
    trackId: z.string(),
    position: z.number().int().min(0).describe("Place from the bottom, 0 = bottom"),
  }),
  when: available,
  run: (ctx, args): Op[] => {
    const comp = activeComposition(ctx);
    if (comp === undefined) throw new ActionError("Open a composition first.");
    const toIndex = Math.min(args.position, comp.tracks.length - 1);
    const from = comp.tracks.findIndex((t) => t.id === args.trackId);
    if (from < 0) throw new ActionError("That layer doesn't exist.");
    if (from === toIndex) return [];
    return [{ type: "reorderTrack", compositionId: comp.id, trackId: args.trackId, toIndex }];
  },
});

editingActions.register({
  id: "layer.addLook",
  icon: "lut",
  title: "Add a look as an adjustment layer",
  description:
    "Add an adjustment layer carrying one of the built-in colour looks, over everything below it. Lower its opacity to soften the look.",
  keywords: ["look", "filter", "preset", "lut", "grade", "instagram", "style", "photo"],
  category: "Layers",
  argsSchema: z.object({
    look: z.enum(LOOK_IDS),
    intensity: z.number().min(0).max(100).optional(),
  }),
  when: (ctx) => activeComposition(ctx) !== undefined,
  run: (ctx, args): Op[] => {
    const comp = activeComposition(ctx);
    if (comp === undefined) throw new ActionError("Open a composition first.");
    const info = BUILTIN_LUTS.find((l) => l.id === args.look);
    const clipId = ctx.services.newId();
    ctx.services.editor.selectClips([clipId]);
    return addLayerOps(
      comp,
      createClip({
        id: clipId,
        type: "adjustment",
        startUs: 0,
        inUs: 0,
        outUs: DEFAULT_IMAGE_US,
        color: {
          ...neutralColor(),
          lut: { lutId: args.look, intensity: (args.intensity ?? 100) / 100 },
        },
      }),
      ctx.services.newId(),
      info === undefined ? "Look" : `Look: ${info.name}`,
    );
  },
});
