import type { AnyAction } from "@lumacut/actions";
import { useState } from "react";
import { editingActions, type EditingContext } from "../../actions/editing.ts";
import { Icon } from "../Icon.tsx";
import { Tip } from "../Tip.tsx";

interface SimpleBarProps {
  ctx: EditingContext;
  onRun: (action: AnyAction<EditingContext>, args?: unknown) => void;
  hasSlots: boolean;
}

interface BigButton {
  action: string;
  label: string;
  icon: string;
  args?: unknown;
}

const BUTTONS: BigButton[] = [
  { action: "media.import", label: "Add media", icon: "upload" },
  { action: "clip.split", label: "Split", icon: "split" },
  { action: "text.add", label: "Text", icon: "text" },
  { action: "panel.showEffects", label: "Effects", icon: "effect" },
  { action: "panel.showStickers", label: "Stickers", icon: "shape" },
  { action: "panel.showText", label: "Captions", icon: "text" },
  { action: "panel.showMedia", label: "Library", icon: "folder" },
  { action: "export.open", label: "Export", icon: "download" },
];

const SPEEDS = [0.5, 1, 1.5, 2, 4];
const ASPECTS = ["9:16", "16:9", "1:1", "4:5"] as const;

/** Simple mode's big buttons: the everyday edits, each a registry action with its tooltip. */
export function SimpleBar({ ctx, onRun, hasSlots }: SimpleBarProps) {
  const [open, setOpen] = useState<"speed" | "shape" | null>(null);
  const button = (b: BigButton) => {
    const action = editingActions.get(b.action);
    const available = action.when(ctx);
    return (
      <Tip
        key={`${b.action}:${b.label}`}
        title={b.label}
        description={action.description}
        shortcut={action.shortcut}
      >
        <button
          type="button"
          aria-label={b.label}
          disabled={!available}
          onMouseDown={(e) => {
            e.preventDefault();
          }}
          onClick={() => {
            onRun(action, b.args);
          }}
          className="flex min-w-16 flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] text-neutral-200 hover:bg-neutral-800 disabled:opacity-40"
        >
          <Icon name={b.icon} className="h-5 w-5" />
          {b.label}
        </button>
      </Tip>
    );
  };
  return (
    <div
      role="toolbar"
      aria-label="Simple tools"
      className="relative flex flex-wrap items-center gap-1 rounded-lg border border-neutral-800 bg-neutral-900/60 px-2 py-1"
    >
      {hasSlots && button({ action: "panel.showSlots", label: "Template", icon: "layers" })}
      {BUTTONS.slice(0, 2).map(button)}
      <Tip title="Speed" description="Play the selected clip faster or slower.">
        <button
          type="button"
          aria-label="Speed"
          aria-expanded={open === "speed"}
          disabled={!editingActions.get("clip.setSpeed").when(ctx)}
          onClick={() => {
            setOpen(open === "speed" ? null : "speed");
          }}
          className="flex min-w-16 flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] text-neutral-200 hover:bg-neutral-800 disabled:opacity-40"
        >
          <Icon name="skipForward" className="h-5 w-5" />
          Speed
        </button>
      </Tip>
      {BUTTONS.slice(2).map(button)}
      <Tip title="Shape" description="Change the video's shape: 9:16, 16:9, 1:1 or 4:5.">
        <button
          type="button"
          aria-label="Video shape"
          aria-expanded={open === "shape"}
          onClick={() => {
            setOpen(open === "shape" ? null : "shape");
          }}
          className="flex min-w-16 flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] text-neutral-200 hover:bg-neutral-800"
        >
          <Icon name="fit" className="h-5 w-5" />
          Shape
        </button>
      </Tip>
      {open !== null && (
        <div
          role="menu"
          className="absolute left-2 top-full z-30 mt-1 flex gap-1 rounded-lg border border-neutral-700 bg-neutral-900 p-1 shadow-xl"
        >
          {open === "speed"
            ? SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onRun(editingActions.get("clip.setSpeed"), { speed: s });
                    setOpen(null);
                  }}
                  className="rounded px-3 py-1 text-xs hover:bg-neutral-800"
                >
                  {s}×
                </button>
              ))
            : ASPECTS.map((a) => (
                <button
                  key={a}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onRun(editingActions.get("project.setAspect"), { aspect: a });
                    setOpen(null);
                  }}
                  className="rounded px-3 py-1 text-xs hover:bg-neutral-800"
                >
                  {a}
                </button>
              ))}
        </div>
      )}
    </div>
  );
}
