import { ActionError } from "@lumacut/actions";
import { EFFECTS, effectById } from "@lumacut/effects";
import type { Clip, Op } from "@lumacut/schema";
import * as z from "zod";
import {
  effectAppliesToClip,
  filterLayerOps,
  type FilterContent,
} from "../editor/filter-layers.ts";
import { addEffectOps, moveEffectOp, setEffectEnabledOp } from "../inspector/effect-ops.ts";
import { placedClips } from "../timeline/clips.ts";
import {
  DEFAULT_IMAGE_US,
  activeComposition,
  editingActions,
  type EditingContext,
} from "./editing.ts";

/** Unlocked picture-track clips (media, solids, adjustment layers…) in the selection. */
function targets(ctx: EditingContext): Clip[] {
  const comp = activeComposition(ctx);
  if (comp === undefined) return [];
  const wanted = new Set(ctx.selectedClipIds);
  return placedClips(comp)
    .filter((p) => wanted.has(p.clip.id) && !p.track.locked && p.track.kind === "visual")
    .map((p) => p.clip);
}

const available = (ctx: EditingContext): boolean => targets(ctx).length > 0;
const EFFECT_IDS = EFFECTS.map((e) => e.id) as [string, ...string[]];
const EffectArg = z
  .enum(EFFECT_IDS)
  .describe("Effect id: " + EFFECTS.map((e) => `${e.id} (${e.name}, ${e.category})`).join("; "));

/**
 * Adds a filter (a look or an effect) on its own adjustment layer, directly above the selection
 * (spanning it in a video), and selects the new layer so its settings show in the Inspector.
 */
export function addFilterLayer(ctx: EditingContext, filter: FilterContent): Op[] {
  const comp = activeComposition(ctx);
  if (comp === undefined) throw new ActionError("Open a composition first.");
  const clipId = ctx.services.newId();
  const ops = filterLayerOps(
    comp,
    filter,
    {
      photo: ctx.project?.kind === "photo",
      selectedClipIds: ctx.selectedClipIds,
      playheadUs: ctx.playheadUs,
      defaultUs: DEFAULT_IMAGE_US,
    },
    { clipId, trackId: ctx.services.newId(), effectId: ctx.services.newId() },
  );
  ctx.services.editor.selectClips([clipId]);
  return ops;
}

const CLIP_ONLY = EFFECTS.filter((e) => e.appliesTo === "clip")
  .map((e) => e.name)
  .join(", ");

/** The effect on each selected clip itself; clip-only effects need a selection. */
function addToClips(ctx: EditingContext, effect: string): Op[] {
  const clips = targets(ctx);
  if (clips.length === 0) {
    const name = effectById(effect)?.name ?? effect;
    throw new ActionError(`“${name}” works on a clip itself: select a clip first.`);
  }
  return addEffectOps(clips, effect, ctx.services.newId);
}

editingActions.register({
  id: "effect.add",
  title: "Add an effect",
  description:
    "Add a visual effect (blur, glow, vignette, grain, …) as its own adjustment layer, directly above the selected clips and as long as them (5 s from the playhead when nothing is selected); it changes everything below it. " +
    `Effects that work from a clip's own shape or colours (${CLIP_ONLY}) go onto the selected clips instead. Change its settings in the Inspector.`,
  keywords: [
    "effect",
    "filter",
    "fx",
    "blur",
    "glow",
    "stylize",
    "distort",
    "key",
    "add effect",
    "adjustment layer",
  ],
  category: "Effects",
  icon: "effect",
  argsSchema: z.object({ effect: EffectArg }),
  when: (ctx) => activeComposition(ctx) !== undefined,
  run: (ctx, args): Op[] => {
    const { effect } = args;
    return effectAppliesToClip(effect)
      ? addToClips(ctx, effect)
      : addFilterLayer(ctx, { effectId: effect });
  },
});

editingActions.register({
  id: "effect.addToClip",
  title: "Add an effect to the selected clips",
  description:
    "Put a visual effect on the selected clips themselves (not on a separate layer), so it changes only those clips. Change its settings in the Inspector.",
  keywords: ["effect", "filter", "fx", "clip", "only this clip", "on the clip", "add effect"],
  category: "Effects",
  icon: "effect",
  argsSchema: z.object({ effect: EffectArg }),
  when: available,
  run: (ctx, args): Op[] => addToClips(ctx, args.effect),
});

/** Instances of an effect id on the selected clips. */
function instancesOf(ctx: EditingContext, effectId: string): { clip: Clip; id: string }[] {
  return targets(ctx).flatMap((clip) =>
    clip.effects.filter((e) => e.effectId === effectId).map((e) => ({ clip, id: e.id })),
  );
}

function requireInstances(ctx: EditingContext, effectId: string): { clip: Clip; id: string }[] {
  const found = instancesOf(ctx, effectId);
  if (found.length === 0) {
    const name = effectById(effectId)?.name ?? effectId;
    throw new ActionError(`The selected clips have no “${name}” effect.`);
  }
  return found;
}

const hasEffects = (ctx: EditingContext): boolean => targets(ctx).some((c) => c.effects.length > 0);

editingActions.register({
  id: "effect.remove",
  title: "Remove an effect",
  description: "Remove every instance of an effect from the selected clips.",
  keywords: ["effect", "remove", "delete", "filter", "fx"],
  category: "Effects",
  argsSchema: z.object({ effect: EffectArg }),
  when: hasEffects,
  run: (ctx, args): Op[] => {
    const { effect } = args;
    return requireInstances(ctx, effect).map(({ clip, id }) => ({
      type: "removeEffect",
      clipId: clip.id,
      effectId: id,
    }));
  },
});

editingActions.register({
  id: "effect.removeAll",
  title: "Remove all effects",
  description: "Clear the effect stack of the selected clips.",
  keywords: ["effects", "clear", "remove all", "reset", "filters"],
  category: "Effects",
  when: hasEffects,
  run: (ctx): Op[] =>
    targets(ctx).flatMap((clip) =>
      clip.effects.map((e): Op => ({ type: "removeEffect", clipId: clip.id, effectId: e.id })),
    ),
});

editingActions.register({
  id: "effect.toggle",
  title: "Turn an effect on or off",
  description:
    "Switch an effect off (or back on) on the selected clips without losing its settings.",
  keywords: ["effect", "disable", "enable", "bypass", "toggle", "compare"],
  category: "Effects",
  argsSchema: z.object({ effect: EffectArg }),
  when: hasEffects,
  run: (ctx, args): Op[] => {
    const { effect } = args;
    return requireInstances(ctx, effect).map(({ clip, id }) => {
      const on = clip.effects.find((e) => e.id === id)?.enabled === true;
      return setEffectEnabledOp(clip.id, id, !on);
    });
  },
});

editingActions.register({
  id: "effect.move",
  title: "Move an effect in the stack",
  description:
    "Effects apply from the first to the last: move one earlier (up) or later (down) in the selected clips' stack.",
  keywords: ["effect", "order", "stack", "reorder", "move up", "move down"],
  category: "Effects",
  argsSchema: z.object({ effect: EffectArg, direction: z.enum(["up", "down"]) }),
  when: (ctx) => targets(ctx).some((c) => c.effects.length > 1),
  run: (ctx, args): Op[] => {
    const { effect, direction } = args;
    return requireInstances(ctx, effect).flatMap(({ clip, id }) => {
      const op = moveEffectOp(clip, id, direction === "up" ? -1 : 1);
      return op === null ? [] : [op];
    });
  },
});
