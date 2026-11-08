import { ActionError } from "@lumacut/actions";
import { createClip, neutralColor, type Color, type Op, type PaintStroke } from "@lumacut/schema";
import * as z from "zod";
import { addLayerOps, nextLayerName } from "../photo/layers.ts";
import { DEFAULT_BRUSH } from "../photo/types.ts";
import { placedClips } from "../timeline/clips.ts";
import {
  DEFAULT_IMAGE_US,
  activeComposition,
  editingActions,
  type EditingContext,
} from "./editing.ts";

const HEX = /^#?([0-9a-f]{6})$/i;
/** "#ff3b6b" → a colour, or null. */
export function parseHex(text: string): Color | null {
  const m = HEX.exec(text.trim());
  if (m?.[1] === undefined) return null;
  const n = Number.parseInt(m[1], 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a: 1 };
}

const isPaint = (ctx: EditingContext) => {
  const comp = activeComposition(ctx);
  if (comp === undefined) return [];
  const wanted = new Set(ctx.selectedClipIds);
  return placedClips(comp).filter(
    (p) => wanted.has(p.clip.id) && p.clip.type === "paint" && !p.track.locked,
  );
};

const newPaintClip = (id: string) =>
  createClip({
    id,
    type: "paint",
    startUs: 0,
    inUs: 0,
    outUs: DEFAULT_IMAGE_US,
    paint: { strokes: [] },
    color: neutralColor(),
  });

editingActions.register({
  id: "layer.addPaint",
  title: "Add a paint layer",
  description:
    "Add an empty transparent layer to paint on with the brush and eraser. Brush strokes are kept as vectors, so they stay editable and undoable.",
  keywords: ["paint", "brush", "layer", "draw", "retouch", "new layer", "transparent"],
  category: "Layers",
  icon: "brush",
  when: (ctx) => activeComposition(ctx) !== undefined,
  run: (ctx): Op[] => {
    const comp = activeComposition(ctx);
    if (comp === undefined) throw new ActionError("Open a composition first.");
    const clipId = ctx.services.newId();
    ctx.services.editor.selectClips([clipId]);
    return addLayerOps(
      comp,
      newPaintClip(clipId),
      ctx.services.newId(),
      nextLayerName(comp, "Paint"),
    );
  },
});

editingActions.register({
  id: "paint.stroke",
  title: "Paint a stroke",
  description:
    "Draw one brush or eraser stroke on the selected paint layer (a new paint layer is made when none is selected). `points` are x, y, pressure triples in canvas pixels. The brush tool calls this once per stroke, so each stroke is one undo step.",
  keywords: ["paint", "brush", "eraser", "stroke", "draw", "retouch"],
  category: "Layers",
  argsSchema: z.object({
    tool: z.enum(["brush", "eraser"]),
    points: z.array(z.number()).min(3),
    size: z.number().positive().optional().describe("Brush diameter in pixels"),
    hardness: z.number().min(0).max(1).optional(),
    opacity: z.number().min(0).max(1).optional(),
    color: z.string().optional().describe("Hex colour such as #202020"),
  }),
  when: (ctx) => activeComposition(ctx) !== undefined,
  run: (ctx, args): Op[] => {
    const comp = activeComposition(ctx);
    if (comp === undefined) throw new ActionError("Open a composition first.");
    const { tool, points, size, hardness, opacity, color } = args;
    const brush = ctx.photo?.brush ?? DEFAULT_BRUSH;
    const paint = color === undefined ? brush.color : parseHex(color);
    if (paint === null)
      throw new ActionError(`“${String(color)}” isn't a hex colour like #202020.`);
    const stroke: PaintStroke = {
      id: ctx.services.newId(),
      tool,
      color: paint,
      size: size ?? brush.size,
      hardness: hardness ?? brush.hardness,
      opacity: opacity ?? brush.opacity,
      points,
    };
    const target = isPaint(ctx)[0]?.clip;
    if (target !== undefined) {
      return [{ type: "addPaintStrokes", clipId: target.id, strokes: [stroke] }];
    }
    if (ctx.selectedClipIds.length > 0 && isPaint(ctx).length === 0) {
      const locked = placedClips(comp).some(
        (p) => ctx.selectedClipIds.includes(p.clip.id) && p.clip.type === "paint" && p.track.locked,
      );
      if (locked) throw new ActionError("That paint layer is locked.");
    }
    if (tool === "eraser") {
      throw new ActionError("Select a paint layer to erase on.");
    }
    const clipId = ctx.services.newId();
    ctx.services.editor.selectClips([clipId]);
    return [
      ...addLayerOps(
        comp,
        newPaintClip(clipId),
        ctx.services.newId(),
        nextLayerName(comp, "Paint"),
      ),
      { type: "addPaintStrokes", clipId, strokes: [stroke] },
    ];
  },
});

editingActions.register({
  id: "paint.clear",
  title: "Clear a paint layer",
  description: "Remove every stroke from the selected paint layers (undoable).",
  keywords: ["paint", "clear", "erase all", "reset", "empty"],
  category: "Layers",
  when: (ctx) => isPaint(ctx).some((p) => (p.clip.paint?.strokes.length ?? 0) > 0),
  run: (ctx): Op[] =>
    isPaint(ctx).flatMap(({ clip }) => {
      const strokes = clip.paint?.strokes ?? [];
      return strokes.length === 0
        ? []
        : [
            {
              type: "removePaintStrokes" as const,
              clipId: clip.id,
              strokeIds: strokes.map((s) => s.id),
            },
          ];
    }),
});

editingActions.register({
  id: "brush.set",
  title: "Set the brush",
  description:
    "Change the brush used by the brush, eraser and mask brush: size (pixels), hardness (0 soft … 1 hard), opacity and colour.",
  keywords: ["brush", "size", "hardness", "opacity", "colour", "color", "paint"],
  category: "Tools",
  argsSchema: z.object({
    size: z.number().min(1).max(2000).optional(),
    hardness: z.number().min(0).max(1).optional(),
    opacity: z.number().min(0).max(1).optional(),
    color: z.string().optional().describe("Hex colour such as #202020"),
  }),
  when: (ctx) => ctx.services.editor.photo !== undefined,
  run: (ctx, args) => {
    const { size, hardness, opacity, color } = args;
    const parsed = color === undefined ? undefined : parseHex(color);
    if (parsed === null)
      throw new ActionError(`“${String(color)}” isn't a hex colour like #202020.`);
    ctx.services.editor.photo?.setBrush({
      ...(size === undefined ? {} : { size }),
      ...(hardness === undefined ? {} : { hardness }),
      ...(opacity === undefined ? {} : { opacity }),
      ...(parsed === undefined ? {} : { color: parsed }),
    });
    return undefined;
  },
});

function resize(id: string, title: string, shortcut: string, factor: number): void {
  editingActions.register({
    id,
    title,
    description: `${title} (a fifth of the way each press).`,
    keywords: ["brush", "size", factor > 1 ? "bigger" : "smaller", "larger"],
    category: "Tools",
    shortcut,
    when: (ctx) => ctx.services.editor.photo !== undefined && ctx.photo !== undefined,
    run: (ctx) => {
      const size = ctx.photo?.brush.size ?? DEFAULT_BRUSH.size;
      ctx.services.editor.photo?.setBrush({
        size: Math.min(2000, Math.max(1, Math.round(size * factor))),
      });
      return undefined;
    },
  });
}
resize("brush.larger", "Larger brush", "]", 1.2);
resize("brush.smaller", "Smaller brush", "[", 1 / 1.2);
