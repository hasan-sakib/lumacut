import * as z from "zod";
import { FIT_VIEW, type PhotoTool } from "../photo/types.ts";
import { zoomAbout, zoomTo } from "../photo/view.ts";
import { activeComposition, editingActions, type EditingContext } from "./editing.ts";

const isPhoto = (ctx: EditingContext): boolean =>
  ctx.project?.kind === "photo" &&
  activeComposition(ctx) !== undefined &&
  ctx.services.editor.setCanvasTool !== undefined;

function tool(
  id: string,
  pick: PhotoTool,
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
    when: isPhoto,
    run: (ctx) => {
      ctx.services.editor.setCanvasTool?.(pick);
      return undefined;
    },
  });
}

tool(
  "tool.marqueeRect",
  "marqueeRect",
  "Rectangle selection",
  "Drag on the canvas to select a rectangle. Turn it into a mask, crop to it, or invert it.",
  ["select", "marquee", "rectangle", "selection", "box"],
  "Alt+R",
  "marquee",
);
tool(
  "tool.marqueeEllipse",
  "marqueeEllipse",
  "Ellipse selection",
  "Drag on the canvas to select an ellipse or circle.",
  ["select", "marquee", "ellipse", "circle", "oval", "selection"],
  "Alt+O",
  "ellipseMarquee",
);
tool(
  "tool.lasso",
  "lasso",
  "Lasso selection",
  "Draw around what you want with the pointer; letting go closes the selection.",
  ["select", "lasso", "freehand", "selection", "draw selection"],
  "L",
  "lasso",
);
tool(
  "tool.crop",
  "crop",
  "Crop tool",
  "Drag the edges of the crop box (with a rule-of-thirds grid), pick a proportion or tilt the picture to straighten it, then apply.",
  ["crop", "straighten", "trim", "frame", "reframe", "aspect ratio", "photo"],
  "Alt+C",
  "crop",
);
tool(
  "tool.brush",
  "brush",
  "Brush",
  "Paint on a paint layer (made for you when none is selected). Size, hardness, opacity and colour are in the tool options; [ and ] change the size.",
  ["brush", "paint", "draw", "retouch", "colour", "color"],
  "Alt+B",
  "brush",
);
tool(
  "tool.eraser",
  "eraser",
  "Eraser",
  "Rub out paint on the selected paint layer.",
  ["eraser", "erase", "rub out", "paint", "remove"],
  "Alt+X",
  "eraser",
);
tool(
  "tool.maskBrush",
  "maskBrush",
  "Mask brush",
  "Paint a layer's mask: reveal with the brush, hide with the eraser (hold Alt, or switch the mode in the tool options).",
  ["mask", "mask brush", "layer mask", "reveal", "hide", "paint mask"],
  "Alt+K",
  "maskBrush",
);
tool(
  "tool.hand",
  "hand",
  "Hand tool",
  "Drag to move the canvas around. Holding Space does the same from any tool.",
  ["hand", "pan", "move canvas", "scroll", "drag view"],
  "H",
  "hand",
);
tool(
  "tool.zoom",
  "zoom",
  "Zoom tool",
  "Click to zoom in on a spot, Alt-click to zoom out, drag to zoom to a box.",
  ["zoom", "magnify", "closer", "detail"],
  "Z",
  "zoomIn",
);

const sizeOf = (ctx: EditingContext) => {
  const comp = activeComposition(ctx);
  return comp === undefined ? { width: 1, height: 1 } : { width: comp.width, height: comp.height };
};

function zoomAction(id: string, title: string, shortcut: string, factor: number): void {
  editingActions.register({
    id,
    title,
    description: `${title}: change how big the canvas is shown (not the picture itself).`,
    keywords: ["zoom", "view", factor > 1 ? "in" : "out", "magnify"],
    category: "View",
    shortcut,
    when: (ctx) => isPhoto(ctx) && ctx.photo !== undefined,
    run: (ctx) => {
      if (ctx.photo === undefined) return undefined;
      ctx.services.editor.photo?.setView(
        zoomAbout(ctx.photo.view, sizeOf(ctx), ctx.photo.viewport, factor),
      );
      return undefined;
    },
  });
}
zoomAction("view.zoomIn", "Zoom in", "Mod+=", 1.25);
zoomAction("view.zoomOut", "Zoom out", "Mod+-", 1 / 1.25);

editingActions.register({
  id: "view.fit",
  title: "Fit canvas in window",
  description: "Show the whole canvas.",
  keywords: ["fit", "zoom", "whole", "reset view", "view"],
  category: "View",
  shortcut: "Mod+0",
  when: isPhoto,
  run: (ctx) => {
    ctx.services.editor.photo?.setView(FIT_VIEW);
    return undefined;
  },
});

editingActions.register({
  id: "view.zoomTo",
  title: "Zoom to a level",
  description: "Show the canvas at an exact zoom (100 = one screen pixel per canvas pixel).",
  keywords: ["zoom", "percent", "100%", "actual size", "pixels", "view"],
  category: "View",
  shortcut: "Mod+1",
  argsSchema: z.object({ percent: z.number().min(2).max(3200).optional().describe("Default 100") }),
  when: (ctx) => isPhoto(ctx) && ctx.photo !== undefined,
  run: (ctx, args) => {
    if (ctx.photo === undefined) return undefined;
    ctx.services.editor.photo?.setView(
      zoomTo(ctx.photo.view, sizeOf(ctx), ctx.photo.viewport, (args.percent ?? 100) / 100),
    );
    return undefined;
  },
});
