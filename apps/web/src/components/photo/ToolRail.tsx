import type { AnyAction } from "@lumacut/actions";
import { editingActions, type EditingContext } from "../../actions/editing.ts";
import type { CanvasTool } from "../../stores/editor.ts";
import { ActionButton } from "../ActionButton.tsx";

interface ToolRailProps {
  ctx: EditingContext;
  canvasTool: CanvasTool;
  onRun: (action: AnyAction<EditingContext>, args?: unknown) => void;
}

/** Tool actions in the order they appear, with the canvas tool each one switches to. */
const GROUPS: { label: string; tools: { id: string; tool: CanvasTool }[] }[] = [
  { label: "Move", tools: [{ id: "tool.select", tool: "select" }] },
  {
    label: "Select",
    tools: [
      { id: "tool.marqueeRect", tool: "marqueeRect" },
      { id: "tool.marqueeEllipse", tool: "marqueeEllipse" },
      { id: "tool.lasso", tool: "lasso" },
    ],
  },
  {
    label: "Edit",
    tools: [
      { id: "tool.crop", tool: "crop" },
      { id: "tool.brush", tool: "brush" },
      { id: "tool.eraser", tool: "eraser" },
      { id: "tool.maskBrush", tool: "maskBrush" },
    ],
  },
  {
    label: "Draw",
    tools: [
      { id: "tool.pen", tool: "pen" },
      { id: "tool.rectangle", tool: "rect" },
      { id: "tool.ellipse", tool: "ellipse" },
      { id: "tool.polygon", tool: "polygon" },
      { id: "tool.star", tool: "star" },
    ],
  },
  {
    label: "View",
    tools: [
      { id: "tool.hand", tool: "hand" },
      { id: "tool.zoom", tool: "zoom" },
    ],
  },
];

/** The photo workspace's tools down the left edge; every button is a registry action. */
export function ToolRail({ ctx, canvasTool, onRun }: ToolRailProps) {
  return (
    <div
      role="toolbar"
      aria-label="Photo tools"
      aria-orientation="vertical"
      className="flex w-11 shrink-0 flex-col items-center gap-2 overflow-y-auto rounded-lg border border-neutral-800 bg-neutral-900/60 p-1"
    >
      {GROUPS.map((group) => (
        <div
          key={group.label}
          role="group"
          aria-label={group.label}
          className="flex flex-col gap-0.5 border-b border-neutral-800 pb-1 last:border-0"
        >
          {group.tools.map(({ id, tool }) => (
            <ActionButton
              key={id}
              action={editingActions.get(id)}
              ctx={ctx}
              variant="icon"
              pressed={canvasTool === tool}
              onRun={onRun}
              className={
                canvasTool === tool
                  ? "bg-sky-700 text-white"
                  : "text-neutral-300 hover:bg-neutral-800"
              }
            />
          ))}
        </div>
      ))}
    </div>
  );
}
