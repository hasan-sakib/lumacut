import { ActionError } from "@lumacut/actions";
import { createClip, type Color, type Composition, type Op } from "@lumacut/schema";
import * as z from "zod";
import {
  DEFAULT_FILL,
  SHAPE_KINDS,
  addItemOp,
  defaultShapeData,
  removeItemOp,
  shapeItemForBox,
} from "../inspector/shapes.ts";
import { placedClips } from "../timeline/clips.ts";
import { activeComposition, editingActions, trackFor, type EditingContext } from "./editing.ts";

const US = 1_000_000;
const KINDS = SHAPE_KINDS.map((k) => k.kind) as [
  "rect" | "ellipse" | "polygon" | "star",
  ...("rect" | "ellipse" | "polygon" | "star")[],
];

const hex = (value: string): Color | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  if (m?.[1] === undefined) return null;
  const n = Number.parseInt(m[1], 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a: 1 };
};

function need(ctx: EditingContext): Composition {
  const comp = activeComposition(ctx);
  if (comp === undefined) throw new ActionError("Open a composition first.");
  return comp;
}

function shapeClips(ctx: EditingContext) {
  const comp = activeComposition(ctx);
  if (comp === undefined) return [];
  const wanted = new Set(ctx.selectedClipIds);
  return placedClips(comp).filter(
    (p) => wanted.has(p.clip.id) && !p.track.locked && p.clip.type === "shape",
  );
}

editingActions.register({
  id: "shape.add",
  title: "Add a shape",
  description:
    "Add a shape layer at the playhead: rectangle, ellipse, polygon or star, filled with a colour. Style it in the Inspector or draw on the canvas with the shape tools.",
  keywords: ["shape", "rectangle", "ellipse", "circle", "polygon", "star", "box", "bar", "vector"],
  category: "Shapes",
  icon: "shape",
  argsSchema: z.object({
    kind: z.enum(KINDS),
    color: z.string().optional().describe("Fill colour as hex, e.g. #ff3b6b"),
    seconds: z.number().min(0.1).max(3600).optional().describe("Length in seconds (default 5)"),
    x: z.number().optional().describe("Centre, in composition pixels (default: the middle)"),
    y: z.number().optional(),
    width: z
      .number()
      .positive()
      .optional()
      .describe("Size in composition pixels (default: a quarter of the height)"),
    height: z.number().positive().optional(),
  }),
  when: (ctx) => activeComposition(ctx) !== undefined,
  run: (ctx, args): Op[] => {
    const comp = need(ctx);
    const { kind, color, seconds, x, y, width, height } = args;
    const fill = color === undefined ? DEFAULT_FILL : hex(color);
    if (fill === null) throw new ActionError(`“${color ?? ""}” isn't a hex colour like #ff3b6b.`);
    const length = Math.round((seconds ?? 5) * US);
    const ops: Op[] = [];
    const trackId = trackFor(ctx, comp, "visual", ctx.playheadUs, ctx.playheadUs + length, ops);
    const itemId = ctx.services.newId();
    const shape =
      width !== undefined && height !== undefined
        ? { items: [shapeItemForBox(kind, itemId, width, height)] }
        : defaultShapeData(kind, itemId, comp);
    ops.push({
      type: "addClip",
      trackId,
      clip: createClip({
        id: ctx.services.newId(),
        type: "shape",
        startUs: ctx.playheadUs,
        inUs: 0,
        outUs: length,
        // The shape's own origin sits at the middle of the composition.
        transform: {
          x: x ?? comp.width / 2,
          y: y ?? comp.height / 2,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          anchorX: 0,
          anchorY: 0,
          skew: 0,
        },
        shape: { ...shape, fill: { color: fill, rule: "nonzero" } },
      }),
    });
    return ops;
  },
});

editingActions.register({
  id: "shape.addItem",
  title: "Add to a shape",
  description:
    "Add another rectangle, ellipse, polygon or star to the selected shape layer (they are filled and stroked together).",
  keywords: ["shape", "add item", "combine", "group", "rectangle", "ellipse", "polygon", "star"],
  category: "Shapes",
  argsSchema: z.object({ kind: z.enum(KINDS) }),
  when: (ctx) => shapeClips(ctx).length > 0,
  run: (ctx, args): Op[] => {
    const { kind } = args;
    return shapeClips(ctx).flatMap(({ clip }) => {
      const op = addItemOp(clip, kind, ctx.services.newId());
      return op === null ? [] : [op];
    });
  },
});

editingActions.register({
  id: "shape.removeItem",
  title: "Remove from a shape",
  description:
    "Remove one item from the selected shape (by its id, or the last item when no id is given).",
  keywords: ["shape", "remove item", "delete part"],
  category: "Shapes",
  argsSchema: z.object({ item: z.string().optional() }),
  when: (ctx) => shapeClips(ctx).some((p) => (p.clip.shape?.items.length ?? 0) > 0),
  run: (ctx, args): Op[] => {
    const { item } = args;
    return shapeClips(ctx).flatMap(({ clip }) => {
      const id = item ?? clip.shape?.items[clip.shape.items.length - 1]?.id;
      if (id === undefined) return [];
      const op = removeItemOp(clip, id);
      return op === null ? [] : [op];
    });
  },
});

editingActions.register({
  id: "shape.setStyle",
  title: "Style a shape",
  description:
    "Set the fill colour, stroke colour and width, and trim (how much of the outline is drawn) of the selected shapes.",
  keywords: ["shape", "fill", "stroke", "outline", "colour", "trim", "style", "border"],
  category: "Shapes",
  argsSchema: z.object({
    fill: z.string().optional().describe("Fill colour (hex) or “none”"),
    stroke: z.string().optional().describe("Stroke colour (hex) or “none”"),
    strokeWidth: z.number().min(0).max(500).optional(),
    trimStart: z.number().min(0).max(100).optional().describe("Percent"),
    trimEnd: z.number().min(0).max(100).optional().describe("Percent"),
  }),
  when: (ctx) => shapeClips(ctx).length > 0,
  run: (ctx, args): Op[] => {
    const a = args;
    return shapeClips(ctx).flatMap(({ clip }) => {
      const shape = clip.shape;
      if (shape === undefined) return [];
      let next = { ...shape };
      if (a.fill !== undefined) {
        const { fill: _removed, ...rest } = next;
        if (a.fill.toLowerCase() === "none") next = rest;
        else {
          const color = hex(a.fill);
          if (color === null) throw new ActionError(`“${a.fill}” isn't a hex colour like #ff3b6b.`);
          next = { ...rest, fill: { color, rule: shape.fill?.rule ?? "nonzero" } };
        }
      }
      if (a.stroke !== undefined || a.strokeWidth !== undefined) {
        const base = next.stroke ?? {
          color: { r: 1, g: 1, b: 1, a: 1 },
          width: 6,
          cap: "round" as const,
          join: "round" as const,
          dash: [],
        };
        if (a.stroke?.toLowerCase() === "none") {
          const { stroke: _removed, ...rest } = next;
          next = rest;
        } else {
          const color = a.stroke === undefined ? base.color : hex(a.stroke);
          if (color === null)
            throw new ActionError(`“${a.stroke ?? ""}” isn't a hex colour like #ffffff.`);
          next = { ...next, stroke: { ...base, color, width: a.strokeWidth ?? base.width } };
        }
      }
      if (a.trimStart !== undefined || a.trimEnd !== undefined) {
        const base = next.trimPaths ?? { start: 0, end: 1, offset: 0 };
        next = {
          ...next,
          trimPaths: {
            ...base,
            start: (a.trimStart ?? base.start * 100) / 100,
            end: (a.trimEnd ?? base.end * 100) / 100,
          },
        };
      }
      return [{ type: "setProps" as const, clipId: clip.id, props: { shape: next } }];
    });
  },
});

const VertexArg = z.object({
  point: z.tuple([z.number(), z.number()]),
  inTangent: z.tuple([z.number(), z.number()]),
  outTangent: z.tuple([z.number(), z.number()]),
});
const PathArg = z.object({ closed: z.boolean(), vertices: z.array(VertexArg).min(2) });

editingActions.register({
  id: "shape.addPath",
  title: "Add a drawn path",
  description:
    "Add a shape layer from a path of Bézier vertices in composition pixels (what the pen tool draws). Closed paths are filled; open ones get a stroke.",
  keywords: ["path", "pen", "bezier", "draw", "custom shape", "vector", "line"],
  category: "Shapes",
  argsSchema: z.object({
    path: PathArg,
    color: z.string().optional().describe("Fill (closed) or stroke (open) colour as hex"),
    seconds: z.number().min(0.1).max(3600).optional(),
  }),
  when: (ctx) => activeComposition(ctx) !== undefined,
  run: (ctx, args): Op[] => {
    const comp = need(ctx);
    const { path, color, seconds } = args;
    const paint = color === undefined ? DEFAULT_FILL : hex(color);
    if (paint === null) throw new ActionError(`“${color ?? ""}” isn't a hex colour like #ff3b6b.`);
    const xs = path.vertices.map((v) => v.point[0]);
    const ys = path.vertices.map((v) => v.point[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    // The path is stored around the clip's position, so the layer can be moved by its transform.
    const local = {
      closed: path.closed,
      vertices: path.vertices.map((v) => ({
        point: [v.point[0] - cx, v.point[1] - cy] as [number, number],
        inTangent: v.inTangent,
        outTangent: v.outTangent,
      })),
    };
    const length = Math.round((seconds ?? 5) * US);
    const ops: Op[] = [];
    const trackId = trackFor(ctx, comp, "visual", ctx.playheadUs, ctx.playheadUs + length, ops);
    ops.push({
      type: "addClip",
      trackId,
      clip: createClip({
        id: ctx.services.newId(),
        type: "shape",
        startUs: ctx.playheadUs,
        inUs: 0,
        outUs: length,
        transform: {
          x: cx,
          y: cy,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          anchorX: 0,
          anchorY: 0,
          skew: 0,
        },
        shape: {
          items: [{ kind: "path", id: ctx.services.newId(), path: local }],
          ...(path.closed
            ? { fill: { color: paint, rule: "nonzero" as const } }
            : {
                stroke: {
                  color: paint,
                  width: 8,
                  cap: "round" as const,
                  join: "round" as const,
                  dash: [],
                },
              }),
        },
      }),
    });
    return ops;
  },
});
