import { ActionError } from "@lumacut/actions";
import { createClip, neutralColor, type Clip, type Op } from "@lumacut/schema";
import { MOTION_PRESETS, presetOps } from "@lumacut/ops";
import { STICKERS, stickerById, textData } from "@lumacut/templates";
import * as z from "zod";
import { packMainTrackOps } from "../timeline/magnetic.ts";
import { placedClips } from "../timeline/clips.ts";
import { activeComposition, editingActions, trackFor } from "./editing.ts";

function modeAction(id: string, title: string, mode: "simple" | "pro", description: string): void {
  editingActions.register({
    id,
    title,
    description,
    keywords: [
      "mode",
      mode,
      mode === "simple" ? "easy" : "advanced",
      "layout",
      "beginner",
      "capcut",
      "premiere",
    ],
    category: "View",
    when: (ctx) => ctx.services.editor.setMode !== undefined && ctx.mode !== mode,
    run: (ctx) => {
      ctx.services.editor.setMode?.(mode);
      return undefined;
    },
  });
}
modeAction(
  "mode.simple",
  "Simple mode",
  "simple",
  "Big friendly buttons, one main track that closes its own gaps, and only the basic settings. Nothing in the project changes.",
);
modeAction(
  "mode.pro",
  "Pro mode",
  "pro",
  "Every tool and setting: multi-track timeline, graph editor, masks, scopes. Nothing in the project changes.",
);

editingActions.register({
  id: "mode.toggle",
  title: "Switch Simple / Pro",
  description: "Switch between the Simple and the Pro layout (the project stays exactly the same).",
  keywords: ["mode", "simple", "pro", "switch", "toggle", "easy", "advanced"],
  category: "View",
  shortcut: "Alt+S",
  when: (ctx) => ctx.services.editor.setMode !== undefined,
  run: (ctx) => {
    ctx.services.editor.setMode?.(ctx.mode === "simple" ? "pro" : "simple");
    return undefined;
  },
});

const ASPECTS = {
  "9:16": [1080, 1920],
  "16:9": [1920, 1080],
  "1:1": [1080, 1080],
  "4:5": [1080, 1350],
} as const;

/** Moves a clip (and its animated position) by (dx, dy). */
function shiftOps(clip: Clip, dx: number, dy: number): Op[] {
  const keyframes = Object.fromEntries(
    Object.entries(clip.keyframes).map(([path, frames]) => [
      path,
      frames.map((k) => {
        if (
          path === "transform.position" &&
          Array.isArray(k.value) &&
          typeof k.value[0] === "number" &&
          typeof k.value[1] === "number"
        ) {
          return { ...k, value: [k.value[0] + dx, k.value[1] + dy] as [number, number] };
        }
        if (path === "transform.x" && typeof k.value === "number")
          return { ...k, value: k.value + dx };
        if (path === "transform.y" && typeof k.value === "number")
          return { ...k, value: k.value + dy };
        return k;
      }),
    ]),
  );
  return [
    {
      type: "setProps",
      clipId: clip.id,
      props: {
        transform: { ...clip.transform, x: clip.transform.x + dx, y: clip.transform.y + dy },
        keyframes,
      },
    },
  ];
}

editingActions.register({
  id: "project.setAspect",
  title: "Change the video shape",
  description:
    "Make the video 9:16 (reels, Shorts), 16:9 (YouTube), 1:1 or 4:5 (posts). Everything stays centred; nothing is cut or stretched.",
  keywords: [
    "aspect",
    "ratio",
    "shape",
    "vertical",
    "portrait",
    "landscape",
    "square",
    "9:16",
    "16:9",
    "resize",
  ],
  category: "Canvas",
  argsSchema: z.object({ aspect: z.enum(["9:16", "16:9", "1:1", "4:5"]) }),
  when: (ctx) => ctx.project?.kind !== "photo" && activeComposition(ctx) !== undefined,
  run: (ctx, args): Op[] => {
    const comp = activeComposition(ctx);
    if (comp === undefined) throw new ActionError("Open a composition first.");
    const [width, height] = ASPECTS[args.aspect];
    const dx = (width - comp.width) / 2;
    const dy = (height - comp.height) / 2;
    const ops: Op[] = [
      { type: "updateComposition", compositionId: comp.id, props: { width, height } },
    ];
    for (const { clip, track } of placedClips(comp)) {
      if (track.kind !== "visual" || clip.type === "adjustment") continue;
      // Plain colour fills cover the canvas whatever its size; everything else keeps its place.
      if (clip.type === "solid" && clip.placeholder?.kind !== "media") continue;
      ops.push(...shiftOps(clip, dx, dy));
    }
    return ops;
  },
});

editingActions.register({
  id: "main.closeGaps",
  title: "Close gaps on the main track",
  description:
    "Slide the clips of the main (bottom) video track together so there are no gaps. Simple mode does this by itself.",
  keywords: ["gaps", "close gaps", "magnetic", "ripple", "pack", "main track"],
  category: "Timeline",
  when: (ctx) => {
    const comp = activeComposition(ctx);
    return comp !== undefined && packMainTrackOps(comp).length > 0;
  },
  run: (ctx): Op[] => {
    const comp = activeComposition(ctx);
    return comp === undefined ? [] : packMainTrackOps(comp);
  },
});

editingActions.register({
  id: "clip.setSpeed",
  title: "Change speed",
  description:
    "Play the selected clips faster or slower (0.25× … 4×). Sound keeps its pitch unless you turn that off.",
  keywords: ["speed", "slow motion", "fast forward", "timelapse", "faster", "slower", "0.5x", "2x"],
  category: "Edit",
  argsSchema: z.object({ speed: z.number().min(0.1).max(16) }),
  when: (ctx) => ctx.selectedClipIds.length > 0,
  run: (ctx, args): Op[] => {
    const comp = activeComposition(ctx);
    if (comp === undefined) throw new ActionError("Open a composition first.");
    const wanted = new Set(ctx.selectedClipIds);
    return placedClips(comp)
      .filter((p) => wanted.has(p.clip.id) && !p.track.locked && p.clip.type === "media")
      .map((p) => ({ type: "setProps" as const, clipId: p.clip.id, props: { speed: args.speed } }));
  },
});

const STICKER_IDS = STICKERS.map((s) => s.id) as [string, ...string[]];

editingActions.register({
  id: "sticker.add",
  title: "Add a sticker",
  description:
    "Add a sticker at the playhead for three seconds: " +
    STICKERS.map((s) => s.name.toLowerCase()).join(", ") +
    ". It pops in and is an ordinary layer you can move and restyle.",
  keywords: ["sticker", "emoji", "arrow", "badge", "shape", "fun", "decoration"],
  category: "Graphics",
  icon: "shape",
  argsSchema: z.object({ sticker: z.enum(STICKER_IDS) }),
  when: (ctx) => activeComposition(ctx) !== undefined,
  run: (ctx, args): Op[] => {
    const comp = activeComposition(ctx);
    const sticker = stickerById(args.sticker);
    if (comp === undefined || sticker === undefined)
      throw new ActionError("Open a composition first.");
    const length = 3_000_000;
    const ops: Op[] = [];
    const trackId = trackFor(ctx, comp, "visual", ctx.playheadUs, ctx.playheadUs + length, ops);
    const id = ctx.services.newId();
    const base = {
      id,
      startUs: ctx.playheadUs,
      inUs: 0,
      outUs: length,
      color: neutralColor(),
      transform: {
        x: comp.width / 2,
        y: comp.height / 2,
        anchorX: 0,
        anchorY: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        skew: 0,
      },
    };
    const clip: Clip =
      sticker.text !== undefined
        ? createClip({
            ...base,
            type: "text",
            text: textData(
              sticker.text,
              { size: Math.round(comp.height * 0.12), font: "Inter" },
              [],
            ),
          })
        : createClip({
            ...base,
            type: "shape",
            ...(sticker.shape === undefined ? {} : { shape: structuredClone(sticker.shape) }),
          });
    ops.push({ type: "addClip", trackId, clip });
    const pop = MOTION_PRESETS.find((p) => p.id === "pop");
    if (pop !== undefined) {
      ops.push(
        ...presetOps(pop, clip, {
          width: comp.width,
          height: comp.height,
          newId: ctx.services.newId,
        }),
      );
    }
    ctx.services.editor.selectClips([id]);
    return ops;
  },
});

/** Opens a side panel from a Simple-mode button. */
function panelAction(
  id: string,
  title: string,
  tab: string,
  description: string,
  keywords: string[],
): void {
  editingActions.register({
    id,
    title,
    description,
    keywords,
    category: "View",
    when: (ctx) => ctx.services.editor.showTab !== undefined,
    run: (ctx) => {
      ctx.services.editor.showTab?.(tab);
      return undefined;
    },
  });
}
panelAction(
  "panel.showSlots",
  "Template slots",
  "slots",
  "Show the template's slots: your photos, videos, words and colours.",
  ["template", "slots", "fill", "replace"],
);
panelAction(
  "panel.showMedia",
  "Add media",
  "media",
  "Show your library to add photos, videos and music.",
  ["media", "add", "library", "import", "music"],
);
panelAction(
  "panel.showEffects",
  "Effects",
  "effects",
  "Show the effects, transitions and presets browser.",
  ["effects", "filters", "transitions", "presets", "browse"],
);
panelAction("panel.showText", "Text and captions", "text", "Show the text and captions panel.", [
  "text",
  "title",
  "captions",
  "subtitles",
]);
panelAction("panel.showStickers", "Stickers", "stickers", "Show the stickers and shapes.", [
  "stickers",
  "emoji",
  "shapes",
  "graphics",
]);
panelAction(
  "panel.showInspector",
  "Properties",
  "inspector",
  "Show the settings of the selected clip.",
  ["properties", "inspector", "settings"],
);
