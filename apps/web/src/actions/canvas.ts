import { activeComposition, editingActions, type EditingContext } from "./editing.ts";

type CanvasToolId = "pen" | "rect" | "ellipse" | "polygon" | "star";

function register(
  id: string,
  tool: CanvasToolId,
  title: string,
  description: string,
  keywords: string[],
  shortcut: string,
  icon: string,
): void {
  editingActions.register({
    id,
    title,
    description,
    keywords,
    category: "Tools",
    icon,
    shortcut,
    when: (ctx: EditingContext) =>
      activeComposition(ctx) !== undefined && ctx.services.editor.setCanvasTool !== undefined,
    run: (ctx) => {
      ctx.services.editor.setCanvasTool?.(tool);
      return undefined;
    },
  });
}

register(
  "tool.pen",
  "pen",
  "Pen tool",
  "Draw a path on the preview: click for corner points, drag for curves, click the first point (or press Enter) to finish. Creates a shape layer, or a mask in mask mode.",
  ["pen", "bezier", "path", "draw", "vector", "mask", "roto"],
  "P",
  "pen",
);
register(
  "tool.rectangle",
  "rect",
  "Rectangle tool",
  "Drag on the preview to draw a rectangle shape layer.",
  ["rectangle", "box", "square", "shape", "draw", "bar"],
  "R",
  "shape",
);
register(
  "tool.ellipse",
  "ellipse",
  "Ellipse tool",
  "Drag on the preview to draw an ellipse or circle shape layer.",
  ["ellipse", "circle", "oval", "shape", "draw"],
  "E",
  "shape",
);
register(
  "tool.polygon",
  "polygon",
  "Polygon tool",
  "Drag on the preview to draw a polygon shape layer.",
  ["polygon", "triangle", "pentagon", "shape", "draw"],
  "Shift+P",
  "shape",
);
register(
  "tool.star",
  "star",
  "Star tool",
  "Drag on the preview to draw a star shape layer.",
  ["star", "shape", "draw", "burst"],
  "Shift+E",
  "shape",
);

editingActions.register({
  id: "tool.penMode",
  title: "Pen draws shapes / masks",
  description: "Switch what the pen tool makes: a new shape layer, or a mask on the selected clip.",
  keywords: ["pen", "mask mode", "shape mode", "draw mask", "toggle"],
  category: "Tools",
  shortcut: "Shift+M",
  when: (ctx) => ctx.services.editor.setPenMode !== undefined,
  run: (ctx) => {
    ctx.services.editor.setPenMode?.(ctx.penMode === "mask" ? "shape" : "mask");
    return undefined;
  },
});
