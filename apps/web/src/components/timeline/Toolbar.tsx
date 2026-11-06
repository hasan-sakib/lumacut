import type { AnyAction } from "@lumacut/actions";
import type { Rational } from "@lumacut/schema";
import { editingActions, type EditingContext } from "../../actions/editing.ts";
import { formatTimecode } from "../../engine/transport.ts";
import type { Tool } from "../../stores/editor.ts";
import { ActionButton } from "../ActionButton.tsx";

interface ToolbarProps {
  ctx: EditingContext;
  tool: Tool;
  snapping: boolean;
  playing: boolean;
  playheadUs: number;
  fps: Rational;
  onRun: (action: AnyAction<EditingContext>, args?: unknown) => void;
}

const TOOLS: Tool[] = ["select", "razor", "ripple", "roll", "slip", "slide"];
const GROUP = "flex items-center gap-0.5 rounded-md bg-neutral-900 p-0.5";
const BUTTON = "text-neutral-200 hover:bg-neutral-800";

/** Every button is an action from the registry: its tooltip, label and shortcut come from there. */
export function Toolbar({ ctx, tool, snapping, playing, playheadUs, fps, onRun }: ToolbarProps) {
  const button = (id: string, pressed?: boolean) => (
    <ActionButton key={id} action={editingActions.get(id)} ctx={ctx} variant="icon" onRun={onRun} {...(pressed === undefined ? {} : { pressed })} className={BUTTON} />
  );
  return (
    <div role="toolbar" aria-label="Timeline tools" className="flex flex-wrap items-center gap-2 border-y border-neutral-800 bg-neutral-950 px-3 py-1.5">
      <div className={GROUP}>{["history.undo", "history.redo"].map((id) => button(id))}</div>
      <div className={GROUP} role="group" aria-label="Tools">
        {TOOLS.map((t) => button(`tool.${t}`, tool === t))}
      </div>
      <div className={GROUP}>{button("timeline.toggleSnapping", snapping)}</div>
      <div className={GROUP}>
        {button("playback.goToStart")}
        {button("playback.stepBack")}
        {button("playback.playPause", playing)}
        {button("playback.stepForward")}
        {button("playback.goToEnd")}
      </div>
      <span data-testid="timecode" aria-label="Playhead timecode" className="font-mono text-sm tabular-nums text-neutral-100">
        {formatTimecode(playheadUs, fps)}
      </span>
      <div className={`${GROUP} ml-auto`}>
        {button("marker.add")}
        {["timeline.zoomOut", "timeline.zoomIn", "timeline.zoomFit"].map((id) => button(id))}
        {button("palette.open")}
      </div>
    </div>
  );
}
