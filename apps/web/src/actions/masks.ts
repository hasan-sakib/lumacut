import { ActionError } from "@lumacut/actions";
import { animatedClip, endOf } from "@lumacut/ops";
import { applyToPoint, invert } from "@lumacut/engine";
import type { Clip, Op } from "@lumacut/schema";
import * as z from "zod";
import {
  addMaskOp,
  ellipsePath,
  layerSizeOf,
  newPathMask,
  rectPath,
  removeMaskOp,
} from "../inspector/masks.ts";
import { layerBoxOf, layerToComp } from "../overlay/layer-box.ts";
import { placedClips, type Placed } from "../timeline/clips.ts";
import { activeComposition, editingActions, type EditingContext } from "./editing.ts";

/** Unlocked picture clips in the selection. */
function targets(ctx: EditingContext): Placed[] {
  const comp = activeComposition(ctx);
  if (comp === undefined) return [];
  const wanted = new Set(ctx.selectedClipIds);
  return placedClips(comp).filter(
    (p) => wanted.has(p.clip.id) && !p.track.locked && p.track.kind === "visual",
  );
}

const available = (ctx: EditingContext): boolean => targets(ctx).length > 0;
const MODES = ["add", "subtract", "intersect"] as const;

editingActions.register({
  id: "mask.add",
  title: "Add a mask",
  description:
    "Add a rectangular or elliptical mask to the selected clips; the clip shows only inside it. Edit its points with the pen tool, and its feather and expansion in the Inspector.",
  keywords: ["mask", "crop shape", "cut out", "vignette", "reveal", "hole", "shape mask"],
  category: "Masks",
  argsSchema: z.object({
    shape: z.enum(["rect", "ellipse"]),
    mode: z.enum(MODES).optional(),
  }),
  when: available,
  run: (ctx, args): Op[] => {
    const { shape, mode } = args;
    const comp = activeComposition(ctx);
    const project = ctx.project;
    if (comp === undefined || project === null) throw new ActionError("Open a composition first.");
    return targets(ctx).map(({ clip }) => {
      const size = layerSizeOf(clip, project, comp);
      const make = shape === "rect" ? rectPath : ellipsePath;
      const mask = newPathMask(
        ctx.services.newId(),
        make(size.width / 2, size.height / 2, size.width * 0.5, size.height * 0.5),
      );
      return addMaskOp(clip, mode === undefined ? mask : { ...mask, mode });
    });
  },
});

editingActions.register({
  id: "mask.remove",
  title: "Remove a mask",
  description: "Remove the last mask of the selected clips, or all of them with `all`.",
  keywords: ["mask", "remove", "delete", "clear mask"],
  category: "Masks",
  argsSchema: z.object({ all: z.boolean().optional() }),
  when: (ctx) => targets(ctx).some((p) => p.clip.masks.length > 0),
  run: (ctx, args): Op[] => {
    const { all } = args;
    return targets(ctx).flatMap(({ clip }) => {
      const masks = all === true ? clip.masks : clip.masks.slice(-1);
      return masks.map((m) => removeMaskOp(clip, m.id));
    });
  },
});

editingActions.register({
  id: "mask.setMode",
  title: "Set how a mask combines",
  description:
    "Make the last mask of the selected clips add (show inside), subtract (cut a hole) or intersect.",
  keywords: ["mask", "mode", "subtract", "intersect", "add", "invert"],
  category: "Masks",
  argsSchema: z.object({ mode: z.enum(MODES), inverted: z.boolean().optional() }),
  when: (ctx) => targets(ctx).some((p) => p.clip.masks.length > 0),
  run: (ctx, args): Op[] => {
    const { mode, inverted } = args;
    return targets(ctx).flatMap(({ clip }) => {
      const last = clip.masks[clip.masks.length - 1];
      return last === undefined
        ? []
        : [
            {
              type: "updateMask" as const,
              clipId: clip.id,
              maskId: last.id,
              mask: { ...last, mode, ...(inverted === undefined ? {} : { inverted }) },
            },
          ];
    });
  },
});

/** The clip directly above (on a higher visual track, overlapping the clip's start) or below it. */
function neighbour(ctx: EditingContext, clip: Clip, which: "above" | "below"): Clip | undefined {
  const comp = activeComposition(ctx);
  if (comp === undefined) return undefined;
  const here = comp.tracks.findIndex((t) => t.clips.some((c) => c.id === clip.id));
  const order = comp.tracks
    .map((t, i) => ({ t, i }))
    .filter(({ t, i }) => t.kind === "visual" && (which === "above" ? i > here : i < here))
    .sort((a, b) => (which === "above" ? a.i - b.i : b.i - a.i));
  for (const { t } of order) {
    const hit = t.clips.find(
      (c) => c.startUs < endOf(clip) && endOf(c) > clip.startUs && c.id !== clip.id,
    );
    if (hit !== undefined) return hit;
  }
  return undefined;
}

editingActions.register({
  id: "matte.set",
  title: "Use another clip as a matte",
  description:
    "Make the selected clip take its transparency from another clip (the one above it by default, or `below`, or a clip id). The matte clip is hidden. Modes: alpha, alphaInverted, luma, lumaInverted.",
  keywords: ["matte", "track matte", "alpha matte", "luma matte", "cut out", "reveal", "text fill"],
  category: "Masks",
  argsSchema: z.object({
    source: z.string().optional().describe("“above”, “below” or a clip id (default above)"),
    mode: z.enum(["alpha", "alphaInverted", "luma", "lumaInverted"]).optional(),
  }),
  when: available,
  run: (ctx, args): Op[] => {
    const { source, mode } = args;
    const comp = activeComposition(ctx);
    if (comp === undefined) throw new ActionError("Open a composition first.");
    const ops = targets(ctx).flatMap(({ clip }): Op[] => {
      let found: Clip | undefined;
      if (source === undefined || source === "above" || source === "below") {
        found = neighbour(ctx, clip, source === "below" ? "below" : "above");
      } else {
        found = placedClips(comp).find((p) => p.clip.id === source)?.clip;
      }
      if (found === undefined || found.id === clip.id) return [];
      return [
        {
          type: "setProps",
          clipId: clip.id,
          props: { trackMatte: { sourceClipId: found.id, mode: mode ?? "alpha" } },
        },
      ];
    });
    if (ops.length === 0) {
      throw new ActionError(
        "Couldn't find a clip to use as the matte. Put one on a track above (overlapping the clip) or give its id.",
      );
    }
    return ops;
  },
});

editingActions.register({
  id: "matte.clear",
  title: "Remove the track matte",
  description:
    "Stop using another clip as the selected clips' matte (the matte clip is drawn again).",
  keywords: ["matte", "remove matte", "clear matte"],
  category: "Masks",
  when: (ctx) => targets(ctx).some((p) => p.clip.trackMatte !== undefined),
  run: (ctx): Op[] =>
    targets(ctx)
      .filter((p) => p.clip.trackMatte !== undefined)
      .map(({ clip }) => ({
        type: "setProps" as const,
        clipId: clip.id,
        props: {},
        unset: ["trackMatte" as const],
      })),
});

const MaskVertex = z.object({
  point: z.tuple([z.number(), z.number()]),
  inTangent: z.tuple([z.number(), z.number()]),
  outTangent: z.tuple([z.number(), z.number()]),
});

editingActions.register({
  id: "mask.addPath",
  title: "Add a drawn mask",
  description:
    "Add a mask to the selected clips from a path of Bézier vertices in composition pixels (what the pen tool draws in mask mode). The path is mapped into each clip's own picture.",
  keywords: ["mask", "pen", "draw mask", "bezier", "cut out", "roto"],
  category: "Masks",
  argsSchema: z.object({
    path: z.object({ closed: z.boolean(), vertices: z.array(MaskVertex).min(3) }),
    mode: z.enum(MODES).optional(),
  }),
  when: available,
  run: (ctx, args): Op[] => {
    const { path, mode } = args;
    const comp = activeComposition(ctx);
    const project = ctx.project;
    if (comp === undefined || project === null) throw new ActionError("Open a composition first.");
    return targets(ctx).map(({ clip }) => {
      const local = Math.max(0, ctx.playheadUs - clip.startUs);
      const animated = animatedClip(clip, local);
      const box = layerBoxOf(animated, project, comp, local);
      const m = layerToComp(animated, box);
      const inverse = invert(m);
      const point = (p: [number, number]): [number, number] => {
        const q = applyToPoint(inverse, p);
        return [q[0], q[1]];
      };
      // Tangents are offsets: map them as vectors (no translation).
      const vector = (v: [number, number]): [number, number] => [
        inverse[0] * v[0] + inverse[2] * v[1],
        inverse[1] * v[0] + inverse[3] * v[1],
      ];
      const mapped = {
        closed: true,
        vertices: path.vertices.map((v) => ({
          point: point(v.point),
          inTangent: vector(v.inTangent),
          outTangent: vector(v.outTangent),
        })),
      };
      const mask = newPathMask(ctx.services.newId(), mapped);
      return addMaskOp(clip, mode === undefined ? mask : { ...mask, mode });
    });
  },
});
