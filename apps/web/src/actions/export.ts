import { ActionError } from "@lumacut/actions";
import * as z from "zod";
import { EXTENSION } from "../photo/export-image.ts";
import { parseHex } from "./paint.ts";
import { activeComposition, editingActions } from "./editing.ts";

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
