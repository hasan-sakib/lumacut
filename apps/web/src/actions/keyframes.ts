import { ActionError } from "@lumacut/actions";
import { EASE_PRESETS, EASE_PRESET_INFO, easePresetOps, endOf } from "@lumacut/ops";
import type { Clip, Op } from "@lumacut/schema";
import * as z from "zod";
import { toggleKeyframeOp } from "../inspector/animation.ts";
import { FIELDS, fieldById, type ClipInfo } from "../inspector/fields.ts";
import { placedClips } from "../timeline/clips.ts";
import { activeComposition, editingActions, type EditingContext } from "./editing.ts";

/** The inspector properties that have a ◆ (every keyframeable property is listed once). */
const ANIMATABLE = FIELDS.filter((f) => f.animation !== undefined).map((f) => f.id);

const Property = z
  .enum(ANIMATABLE as [string, ...string[]])
  .describe("Which property: " + ANIMATABLE.join(", "));

function selectedClips(ctx: EditingContext): ClipInfo[] {
  const comp = activeComposition(ctx);
  if (comp === undefined || ctx.project === null) return [];
  const wanted = new Set(ctx.selectedClipIds);
  const assets = ctx.project.assets;
  return placedClips(comp)
    .filter((p) => wanted.has(p.clip.id) && !p.track.locked)
    .map((p) => ({
      clip: p.clip,
      track: p.track,
      asset: assets.find((a) => a.id === p.clip.assetId),
    }));
}

const onPlayhead = (ctx: EditingContext, clip: Clip): boolean =>
  ctx.playheadUs >= clip.startUs && ctx.playheadUs <= endOf(clip);

/** Timeline times (µs) of every keyframe on the selected clips, sorted, without duplicates. */
function keyframeTimes(ctx: EditingContext): number[] {
  const times = new Set<number>();
  for (const { clip } of selectedClips(ctx)) {
    for (const frames of Object.values(clip.keyframes)) {
      for (const k of frames) times.add(clip.startUs + k.tUs);
    }
  }
  return [...times].sort((a, b) => a - b);
}

editingActions.register({
  id: "keyframe.toggle",
  title: "Add or remove a keyframe",
  description:
    "Add a keyframe for a property at the playhead (starting its animation), or remove the one that is there.",
  keywords: ["animate", "animation", "diamond", "stopwatch", "keyframe", "set key"],
  category: "Animation",
  icon: "keyframe",
  argsSchema: z.object({ property: Property }),
  when: (ctx) => selectedClips(ctx).some(({ clip }) => onPlayhead(ctx, clip)),
  run: (ctx, args) => {
    const { property } = args;
    const def = fieldById(property);
    const items = selectedClips(ctx).filter(({ clip }) => onPlayhead(ctx, clip));
    const op = toggleKeyframeOp(def, items, ctx.playheadUs);
    if (op === null) {
      throw new ActionError(`${def.label} can't be animated on the selected clips.`);
    }
    return op;
  },
});

function registerJump(id: string, title: string, shortcut: string, direction: 1 | -1): void {
  const target = (ctx: EditingContext): number | undefined => {
    const times = keyframeTimes(ctx);
    return direction === 1
      ? times.find((t) => t > ctx.playheadUs)
      : [...times].reverse().find((t) => t < ctx.playheadUs);
  };
  editingActions.register({
    id,
    title,
    description:
      direction === 1
        ? "Move the playhead to the next keyframe of the selected clips."
        : "Move the playhead to the previous keyframe of the selected clips.",
    keywords: ["keyframe", "jump", "go to", direction === 1 ? "next" : "previous"],
    category: "Animation",
    shortcut,
    when: (ctx) => target(ctx) !== undefined,
    run: (ctx) => {
      const t = target(ctx);
      if (t !== undefined) ctx.services.playback.seek(t);
      return undefined;
    },
  });
}
registerJump("keyframe.next", "Next keyframe", "K", 1);
registerJump("keyframe.previous", "Previous keyframe", "J", -1);

const Preset = z
  .enum(EASE_PRESETS)
  .describe(EASE_PRESETS.map((p) => `${p}: ${EASE_PRESET_INFO[p].description}`).join(" "));

/** The keyframe to ease: the one on the playhead, else the closest before it. */
function easeTarget(clip: Clip, path: string, local: number): number {
  const frames = clip.keyframes[path] ?? [];
  let index = -1;
  frames.forEach((k, i) => {
    if (k.tUs <= local) index = i;
  });
  return index;
}

editingActions.register({
  id: "keyframe.applyEase",
  title: "Ease a keyframe",
  description:
    "Shape the motion after the keyframe at (or just before) the playhead: ease in/out, hold, linear, overshoot, bounce or elastic.",
  keywords: ["easing", "ease", "smooth", "bounce", "elastic", "overshoot", "curve", "graph"],
  category: "Animation",
  argsSchema: z.object({ property: Property, preset: Preset }),
  when: (ctx) =>
    selectedClips(ctx).some(({ clip }) =>
      Object.values(clip.keyframes).some((frames) => frames.length > 0),
    ),
  run: (ctx, args) => {
    const { property, preset } = args;
    const def = fieldById(property);
    const path = def.animation?.path;
    if (path === undefined) throw new ActionError(`${def.label} can't be animated.`);
    const ops: Op[] = [];
    for (const { clip } of selectedClips(ctx)) {
      const local = ctx.playheadUs - clip.startUs;
      const index = easeTarget(clip, path, local);
      if (index < 0) continue;
      ops.push(...easePresetOps(clip, path, index, preset));
    }
    if (ops.length === 0) {
      throw new ActionError(
        `There is no ${def.label.toLowerCase()} keyframe at or before the playhead on the selected clips.`,
      );
    }
    return ops.length === 1 && ops[0] !== undefined
      ? ops[0]
      : { type: "batch", label: `${EASE_PRESET_INFO[preset].title} (${def.label})`, ops };
  },
});

editingActions.register({
  id: "panel.showGraph",
  title: "Graph editor",
  description:
    "Show the graph editor (value and speed curves of keyframes) instead of the timeline.",
  keywords: ["graph", "curves", "easing", "keyframes", "speed graph", "value graph"],
  category: "View",
  shortcut: "Shift+G",
  when: (ctx) => activeComposition(ctx) !== undefined,
  run: (ctx) => {
    ctx.services.editor.setBottomPanel("graph");
    return undefined;
  },
});

editingActions.register({
  id: "panel.showTimeline",
  title: "Timeline",
  description: "Show the timeline instead of the graph editor.",
  keywords: ["timeline", "tracks", "clips"],
  category: "View",
  shortcut: "Shift+T",
  when: (ctx) => activeComposition(ctx) !== undefined,
  run: (ctx) => {
    ctx.services.editor.setBottomPanel("timeline");
    return undefined;
  },
});
