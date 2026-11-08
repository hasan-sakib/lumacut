import { ActionError } from "@lumacut/actions";
import { MOTION_PRESETS, lengthOf, presetById, presetOps } from "@lumacut/ops";
import type { Clip, Op } from "@lumacut/schema";
import * as z from "zod";
import { placedClips } from "../timeline/clips.ts";
import { activeComposition, editingActions, type EditingContext } from "./editing.ts";

/** Unlocked clips in the selection that can be animated. */
function targets(ctx: EditingContext): Clip[] {
  const comp = activeComposition(ctx);
  if (comp === undefined) return [];
  const wanted = new Set(ctx.selectedClipIds);
  return placedClips(comp)
    .filter((p) => wanted.has(p.clip.id) && !p.track.locked && p.track.kind === "visual")
    .map((p) => p.clip);
}

const PRESET_IDS = MOTION_PRESETS.map((p) => p.id) as [string, ...string[]];

editingActions.register({
  id: "preset.apply",
  title: "Apply a motion preset",
  description:
    "Animate the selected clips with a motion preset (fade, slide, pop, bounce, zoom punch, shake, glitch, typewriter…). It adds ordinary keyframes you can edit in the Inspector and graph editor. In presets sit at the clip's start, out presets at its end, emphasis presets at the playhead.",
  keywords: [
    "preset",
    "animate",
    "animation",
    "motion",
    "in",
    "out",
    "slide",
    "pop",
    "bounce",
    "shake",
    "glitch",
    "zoom",
    "typewriter",
    "fade",
  ],
  category: "Motion",
  icon: "keyframe",
  argsSchema: z.object({
    preset: z
      .enum(PRESET_IDS)
      .describe(
        "Preset id: " + MOTION_PRESETS.map((p) => `${p.id} (${p.name}, ${p.category})`).join("; "),
      ),
    durationUs: z.number().int().min(1).optional().describe("Length in µs (preset default)"),
    intensity: z.number().min(0).max(5).optional().describe("1 = normal strength"),
    startUs: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Where it starts inside the clip, µs (by category by default)"),
  }),
  when: (ctx) => targets(ctx).length > 0,
  run: (ctx, args): Op[] => {
    const { preset: id, durationUs, intensity, startUs } = args;
    const preset = presetById(id);
    const comp = activeComposition(ctx);
    if (preset === undefined || comp === undefined) throw new ActionError("Unknown preset.");
    const ops = targets(ctx).flatMap((clip) =>
      presetOps(preset, clip, {
        width: comp.width,
        height: comp.height,
        newId: ctx.services.newId,
        playheadLocalUs: Math.max(0, Math.min(lengthOf(clip), ctx.playheadUs - clip.startUs)),
        ...(durationUs === undefined ? {} : { durationUs }),
        ...(intensity === undefined ? {} : { intensity }),
        ...(startUs === undefined ? {} : { startUs }),
      }),
    );
    if (ops.length === 0) {
      throw new ActionError(
        preset.category === "Text"
          ? `“${preset.name}” works on text and caption clips.`
          : `“${preset.name}” doesn't apply to the selected clips.`,
      );
    }
    return ops;
  },
});

editingActions.register({
  id: "motion.blur",
  title: "Motion blur",
  description:
    "Turn motion blur on or off for the selected clips (it smears fast-moving animation like a camera shutter). Shutter angle 180° is the film default; samples set the quality.",
  keywords: ["motion blur", "shutter", "smear", "fast", "realistic", "blur"],
  category: "Motion",
  icon: "keyframe",
  argsSchema: z.object({
    enabled: z.boolean().optional().describe("On or off (default: toggle)"),
    shutterAngle: z.number().min(0).max(720).optional(),
    samples: z.number().int().min(2).max(64).optional(),
  }),
  when: (ctx) => targets(ctx).length > 0,
  run: (ctx, args): Op[] => {
    const { enabled, shutterAngle, samples } = args;
    return targets(ctx).map((clip) => ({
      type: "setProps" as const,
      clipId: clip.id,
      props: {
        motionBlur: {
          ...clip.motionBlur,
          enabled: enabled ?? !clip.motionBlur.enabled,
          ...(shutterAngle === undefined ? {} : { shutterAngle }),
          ...(samples === undefined ? {} : { samples }),
        },
      },
    }));
  },
});
