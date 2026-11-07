import { ActionError } from "@lumacut/actions";
import { TRANSITIONS, transitionById } from "@lumacut/effects";
import type { Op } from "@lumacut/schema";
import * as z from "zod";
import {
  addTransitionOp,
  removeTransitionOp,
  touchingPrevious,
  updateTransitionOp,
  US,
} from "../inspector/transition-ops.ts";
import { placedClips, type Placed } from "../timeline/clips.ts";
import { activeComposition, editingActions, type EditingContext } from "./editing.ts";

/** Selected picture clips on unlocked tracks. */
function selected(ctx: EditingContext): Placed[] {
  const comp = activeComposition(ctx);
  if (comp === undefined) return [];
  const wanted = new Set(ctx.selectedClipIds);
  return placedClips(comp).filter(
    (p) => wanted.has(p.clip.id) && !p.track.locked && p.track.kind === "visual",
  );
}

const IDS = TRANSITIONS.map((t) => t.id) as [string, ...string[]];
const TransitionArg = z
  .enum(IDS)
  .describe("Transition id: " + TRANSITIONS.map((t) => `${t.id} (${t.name})`).join("; "));

editingActions.register({
  id: "transition.add",
  title: "Add a transition",
  description:
    "Put a transition between each selected clip and the clip before it (they must touch on the same track). Duration is in seconds (default 1; shortened if the clips are short).",
  keywords: [
    "transition",
    "dissolve",
    "wipe",
    "fade",
    "cut",
    "slide",
    "between clips",
    "crossfade",
  ],
  category: "Transitions",
  icon: "effect",
  argsSchema: z.object({
    transition: TransitionArg,
    seconds: z.number().min(0.05).max(30).optional(),
  }),
  when: (ctx) => selected(ctx).some((p) => touchingPrevious(p.track, p.clip) !== undefined),
  run: (ctx, args): Op[] => {
    const { transition, seconds } = args;
    const ops = selected(ctx).flatMap((p) => {
      const op = addTransitionOp(p.track, p.clip, transition, ctx.services.newId, seconds);
      return op === null ? [] : [op];
    });
    if (ops.length === 0) {
      throw new ActionError(
        "A transition goes between two clips on the same track that touch. Select the second one (with no gap before it).",
      );
    }
    return ops;
  },
});

editingActions.register({
  id: "transition.remove",
  title: "Remove the transition",
  description: "Take the transition off the start of the selected clips (a plain cut).",
  keywords: ["transition", "remove", "delete", "cut", "no transition"],
  category: "Transitions",
  when: (ctx) => selected(ctx).some((p) => p.clip.transitionIn !== undefined),
  run: (ctx): Op[] =>
    selected(ctx)
      .filter((p) => p.clip.transitionIn !== undefined)
      .map((p) => removeTransitionOp(p.clip.id)),
});

editingActions.register({
  id: "transition.setDuration",
  title: "Set transition length",
  description: "Change how long the selected clips' transitions last, in seconds.",
  keywords: ["transition", "duration", "length", "longer", "shorter", "seconds"],
  category: "Transitions",
  argsSchema: z.object({ seconds: z.number().min(0.05).max(30) }),
  when: (ctx) => selected(ctx).some((p) => p.clip.transitionIn !== undefined),
  run: (ctx, args): Op[] => {
    const { seconds } = args;
    const ops = selected(ctx).flatMap((p) => {
      const op = updateTransitionOp(p.track, p.clip, { durationUs: Math.round(seconds * US) });
      return op === null ? [] : [op];
    });
    if (ops.length === 0) throw new ActionError("The selected clips have no transition.");
    return ops;
  },
});

/** Used by the browser to label a transition id. */
export const transitionName = (id: string): string => transitionById(id)?.name ?? id;
