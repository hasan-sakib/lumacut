import { ActionError } from "@lumacut/actions";
import type { Op } from "@lumacut/schema";
import * as z from "zod";
import {
  animatedLayers,
  canvasEditOps,
  cropEdit,
  flipEdit,
  resizeEdit,
  rotate90Edit,
  straightenEdit,
  type CanvasEdit,
} from "../photo/canvas-ops.ts";
import { selectionBounds } from "../photo/selection.ts";
import { activeComposition, editingActions, type EditingContext } from "./editing.ts";

const isPhoto = (ctx: EditingContext): boolean =>
  ctx.project?.kind === "photo" && activeComposition(ctx) !== undefined;

/** The ops for a canvas edit, or why it can't be done. */
function run(
  ctx: EditingContext,
  make: (comp: { width: number; height: number }) => CanvasEdit,
): Op[] {
  const comp = activeComposition(ctx);
  if (comp === undefined) throw new ActionError("Open a composition first.");
  const animated = animatedLayers(comp);
  if (animated.length > 0) {
    throw new ActionError(
      `A layer has an animated position, scale or rotation, which can't follow a canvas change. Remove its keyframes first.`,
    );
  }
  return canvasEditOps(comp, make(comp));
}

editingActions.register({
  id: "canvas.crop",
  title: "Crop the canvas",
  description:
    "Keep only a rectangle of the canvas (x, y, width, height in canvas pixels). Every layer keeps its pixels, so undo restores everything.",
  keywords: ["crop", "trim canvas", "cut", "frame", "reframe", "photo"],
  category: "Canvas",
  icon: "layers",
  argsSchema: z.object({
    x: z.number().min(0),
    y: z.number().min(0),
    width: z.number().min(1),
    height: z.number().min(1),
  }),
  when: isPhoto,
  run: (ctx, args) => run(ctx, (comp) => cropEdit(args, comp)),
});

editingActions.register({
  id: "canvas.cropToSelection",
  title: "Crop to selection",
  description: "Crop the canvas to the box around the current selection.",
  keywords: ["crop", "selection", "marquee", "photo", "trim"],
  category: "Canvas",
  when: (ctx) => isPhoto(ctx) && ctx.photo?.selection != null,
  run: (ctx) => {
    const box = selectionBounds(ctx.photo?.selection?.path ?? { closed: true, vertices: [] });
    if (box === null) throw new ActionError("Make a selection first.");
    const done = run(ctx, (comp) => cropEdit(box, comp));
    ctx.services.editor.photo?.setSelection(null);
    return done;
  },
});

function rotation(id: string, title: string, direction: 1 | -1): void {
  editingActions.register({
    id,
    title,
    description: `${title}: a quarter turn of the whole picture (the canvas swaps width and height).`,
    keywords: ["rotate", "turn", "90", "photo", direction === 1 ? "clockwise" : "anticlockwise"],
    category: "Canvas",
    when: isPhoto,
    run: (ctx) => run(ctx, (comp) => rotate90Edit(comp, direction)),
  });
}
rotation("canvas.rotateRight", "Rotate canvas 90° clockwise", 1);
rotation("canvas.rotateLeft", "Rotate canvas 90° anticlockwise", -1);

editingActions.register({
  id: "canvas.straighten",
  title: "Straighten",
  description:
    "Turn the whole picture by a small angle (degrees, clockwise) to level a horizon, then crop away the empty corners.",
  keywords: ["straighten", "level", "horizon", "tilt", "rotate", "photo", "angle"],
  category: "Canvas",
  argsSchema: z.object({ degrees: z.number().min(-45).max(45) }),
  when: isPhoto,
  run: (ctx, args) => run(ctx, (comp) => straightenEdit(comp, args.degrees)),
});

editingActions.register({
  id: "canvas.flip",
  title: "Flip canvas",
  description: "Mirror the whole picture left-right (horizontal) or top-bottom (vertical).",
  keywords: ["flip", "mirror", "reverse", "photo", "horizontal", "vertical"],
  category: "Canvas",
  argsSchema: z.object({ axis: z.enum(["horizontal", "vertical"]) }),
  when: isPhoto,
  run: (ctx, args) => run(ctx, (comp) => flipEdit(comp, args.axis)),
});

editingActions.register({
  id: "canvas.resize",
  title: "Resize the canvas",
  description:
    "Give the canvas a new size in pixels. The picture sits at `anchor` (centre by default); with `scaleContent` it is scaled to fit, otherwise the canvas grows or shrinks around it.",
  keywords: ["resize", "canvas size", "dimensions", "scale", "expand", "shrink", "photo"],
  category: "Canvas",
  argsSchema: z.object({
    width: z.number().int().min(1).max(16384),
    height: z.number().int().min(1).max(16384),
    anchor: z
      .enum([
        "topLeft",
        "top",
        "topRight",
        "left",
        "center",
        "right",
        "bottomLeft",
        "bottom",
        "bottomRight",
      ])
      .optional(),
    scaleContent: z.boolean().optional(),
  }),
  when: isPhoto,
  run: (ctx, args) =>
    run(ctx, (comp) =>
      resizeEdit(
        comp,
        args.width,
        args.height,
        args.anchor ?? "center",
        args.scaleContent === true,
      ),
    ),
});
