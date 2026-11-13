import { ActionError } from "@lumacut/actions";
import * as z from "zod";
import { EXTENSION } from "../photo/export-image.ts";
import { parseHex } from "./paint.ts";
import { BROWSER_MAX_SECONDS, GIF_LIMITS, type ExportSettings } from "@lumacut/engine";
import { activeComposition, editingActions, type EditingContext } from "./editing.ts";

const safeName = (name: string): string =>
  name
    .replace(/[^\w .-]+/g, "")
    .trim()
    .replace(/\s+/g, "-") || "image";

editingActions.register({
  id: "export.image",
  title: "Export image",
  description:
    "Save the picture as a PNG, JPEG or WebP file at full resolution (a photo's whole canvas, or the frame at the playhead of a video). Choose quality (JPEG, WebP), size in percent, and the background colour that transparent areas are flattened onto (always for JPEG).",
  keywords: [
    "export",
    "save",
    "download",
    "png",
    "jpg",
    "jpeg",
    "webp",
    "image",
    "picture",
    "render",
  ],
  category: "Export",
  icon: "download",
  argsSchema: z.object({
    format: z.enum(["png", "jpeg", "webp"]).optional().describe("Default png"),
    quality: z.number().min(1).max(100).optional().describe("JPEG / WebP quality, default 92"),
    percent: z
      .number()
      .min(5)
      .max(800)
      .optional()
      .describe("Size in percent of the canvas, default 100"),
    background: z
      .string()
      .optional()
      .describe("Hex colour to flatten transparency onto (default white for JPEG, none otherwise)"),
    filename: z.string().optional().describe("File name without extension"),
  }),
  when: (ctx) => activeComposition(ctx) !== undefined && ctx.services.editor.photo !== undefined,
  run: async (ctx, args) => {
    const comp = activeComposition(ctx);
    const project = ctx.project;
    const photo = ctx.services.editor.photo;
    if (comp === undefined || project === null) throw new ActionError("Open a project first.");
    if (photo?.renderImage === undefined || photo.download === undefined) {
      throw new ActionError("Exporting isn't available here.");
    }
    const format = args.format ?? "png";
    const background = args.background === undefined ? null : parseHex(args.background);
    if (args.background !== undefined && background === null) {
      throw new ActionError(`“${args.background}” isn't a hex colour like #ffffff.`);
    }
    let blob: Blob;
    try {
      blob = await photo.renderImage({
        compositionId: comp.id,
        tUs: project.kind === "photo" ? 0 : ctx.playheadUs,
        format,
        quality: (args.quality ?? 92) / 100,
        scale: (args.percent ?? 100) / 100,
        background,
      });
    } catch (error) {
      throw new ActionError(error instanceof Error ? error.message : "The export failed.");
    }
    photo.download(blob, `${safeName(args.filename ?? project.name)}.${EXTENSION[format]}`);
    return undefined;
  },
});

editingActions.register({
  id: "export.open",
  title: "Export…",
  description:
    "Open the export window: choose the file type, quality and size, then save the picture.",
  keywords: ["export", "save", "download", "image", "png", "jpg", "dialog"],
  category: "Export",
  icon: "download",
  shortcut: "Mod+Shift+E",
  when: (ctx) => activeComposition(ctx) !== undefined && ctx.services.openExport !== undefined,
  run: (ctx) => {
    ctx.services.openExport?.();
    return undefined;
  },
});

// --- Video, GIF and MP3 (M8) --------------------------------------------------------------------

const FPS = [24, 25, 30, 60] as const;
/** The export frame rate nearest the composition's. */
function nearestFps(num: number, den: number): (typeof FPS)[number] {
  const rate = num / den;
  return FPS.reduce((best, f) => (Math.abs(f - rate) < Math.abs(best - rate) ? f : best), FPS[2]);
}

const VideoArgs = z.object({
  format: z
    .enum(["mp4", "webm"])
    .optional()
    .describe("mp4 (H.264 + AAC, default) or webm (VP9 + Opus)"),
  resolution: z.enum(["720p", "1080p", "source"]).optional().describe("Default 1080p"),
  fps: z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(60)]).optional(),
  quality: z.enum(["high", "medium", "small"]).optional(),
  loudness: z
    .enum(["social", "broadcast", "none"])
    .optional()
    .describe("Default social (−14 LUFS)"),
  where: z
    .enum(["auto", "browser", "server"])
    .optional()
    .describe("auto: the browser for short MP4/WebM it can encode, otherwise the server"),
});

function settingsFor(
  ctx: EditingContext,
  format: ExportSettings["format"],
  args: z.infer<typeof VideoArgs>,
): { compositionId: string; settings: ExportSettings } {
  const comp = activeComposition(ctx);
  if (comp === undefined) throw new ActionError("Open a composition first.");
  if (comp.durationUs <= 0)
    throw new ActionError("There is nothing to export: the composition is empty.");
  return {
    compositionId: comp.id,
    settings: {
      format,
      resolution: args.resolution ?? "1080p",
      fps: args.fps ?? nearestFps(comp.fps.num, comp.fps.den),
      quality: args.quality ?? "high",
      fromUs: 0,
      toUs:
        format === "gif"
          ? Math.min(comp.durationUs, GIF_LIMITS.maxSeconds * 1_000_000)
          : comp.durationUs,
      loudness: args.loudness ?? "social",
    },
  };
}

const canVideo = (ctx: EditingContext): boolean =>
  ctx.services.exports !== undefined &&
  ctx.project?.kind !== "photo" &&
  (activeComposition(ctx)?.durationUs ?? 0) > 0;

async function start(
  ctx: EditingContext,
  where: "auto" | "browser" | "server",
  compositionId: string,
  settings: ExportSettings,
): Promise<undefined> {
  const exports = ctx.services.exports;
  if (exports === undefined) throw new ActionError("Exporting isn't available here.");
  const seconds = (settings.toUs - settings.fromUs) / 1_000_000;
  const browserCan =
    (settings.format === "mp4" || settings.format === "webm") &&
    seconds <= BROWSER_MAX_SECONDS &&
    typeof VideoEncoder !== "undefined";
  const inBrowser = where === "browser" || (where === "auto" && browserCan);
  if (where === "browser" && !browserCan) {
    throw new ActionError(
      seconds > BROWSER_MAX_SECONDS
        ? `The browser exports up to ${String(BROWSER_MAX_SECONDS / 60)} minutes; use the server for this one.`
        : "This browser can't make that file; use the server.",
    );
  }
  try {
    if (inBrowser) {
      if (exports.busy()) throw new Error("An export is already running in this browser.");
      await exports.inBrowser(compositionId, settings);
    } else {
      await exports.onServer(compositionId, settings);
      exports.openPanel();
    }
  } catch (error) {
    throw new ActionError(error instanceof Error ? error.message : "The export failed.");
  }
  return undefined;
}

editingActions.register({
  id: "export.video",
  title: "Export video",
  description:
    "Save the composition as a video: MP4 (H.264 + AAC) or WebM, 720p / 1080p / its own size, 24–60 fps, with the sound normalised to −14 or −23 LUFS. Short videos are made in this browser; long ones on the server.",
  keywords: [
    "export",
    "render",
    "video",
    "mp4",
    "webm",
    "h264",
    "save video",
    "download",
    "publish",
  ],
  category: "Export",
  icon: "download",
  argsSchema: VideoArgs,
  when: canVideo,
  run: async (ctx, args) => {
    const { compositionId, settings } = settingsFor(ctx, args.format ?? "mp4", args);
    return start(ctx, args.where ?? "auto", compositionId, settings);
  },
});

editingActions.register({
  id: "export.gif",
  title: "Export GIF",
  description:
    "Make an animated GIF of the composition (the first 15 seconds at most, up to 720 px, up to 25 fps). Made on the server.",
  keywords: ["gif", "animated gif", "export", "loop", "meme", "reaction"],
  category: "Export",
  icon: "download",
  argsSchema: VideoArgs.pick({ resolution: true, fps: true }),
  when: canVideo,
  run: async (ctx, args) => {
    const { compositionId, settings } = settingsFor(ctx, "gif", {
      ...args,
      resolution: args.resolution ?? "720p",
    });
    return start(ctx, "server", compositionId, settings);
  },
});

editingActions.register({
  id: "export.mp3",
  title: "Export audio (MP3)",
  description:
    "Save the sound of the composition as an MP3, normalised to −14 or −23 LUFS. Made on the server.",
  keywords: ["mp3", "audio", "export", "podcast", "sound", "music"],
  category: "Export",
  icon: "download",
  argsSchema: VideoArgs.pick({ loudness: true }),
  when: canVideo,
  run: async (ctx, args) => {
    const { compositionId, settings } = settingsFor(ctx, "mp3", args);
    return start(ctx, "server", compositionId, settings);
  },
});

editingActions.register({
  id: "export.cancel",
  title: "Cancel export",
  description: "Stop the export running in this browser, or a server export (by id).",
  keywords: ["cancel", "stop", "abort", "export"],
  category: "Export",
  argsSchema: z.object({
    id: z.string().optional().describe("Server export id (default: the browser export)"),
  }),
  when: (ctx) => ctx.services.exports !== undefined,
  run: async (ctx, args) => {
    await ctx.services.exports?.cancel(args.id ?? null);
    return undefined;
  },
});

editingActions.register({
  id: "panel.showExports",
  title: "Exports",
  description: "Show your server exports for this project: progress, download links, cancel.",
  keywords: ["exports", "renders", "downloads", "queue", "server export"],
  category: "View",
  icon: "download",
  when: (ctx) => ctx.services.exports !== undefined,
  run: (ctx) => {
    ctx.services.exports?.openPanel();
    return undefined;
  },
});
