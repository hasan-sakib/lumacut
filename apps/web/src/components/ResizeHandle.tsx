import { useRef, useState } from "react";
import { PANEL_STEP } from "../editor/panel-sizes.ts";

interface ResizeHandleProps {
  /** What the handle resizes, for screen readers and the tooltip ("Side panel", "Timeline"). */
  label: string;
  /** "vertical": a vertical bar that changes a width; "horizontal": a bar that changes a height. */
  orientation: "vertical" | "horizontal";
  /** The panel's size now, in px, and how small / large it may get. */
  value: number;
  min: number;
  max: number;
  /**
   * Which way grows the panel: -1 when dragging left / up makes it bigger (a panel on the right or
   * at the bottom), 1 when dragging right / down does.
   */
  grow: 1 | -1;
  onChange: (px: number) => void;
  /** Back to the default size (double-click, or Home). */
  onReset: () => void;
}

/** The draggable edge between two panels. Drag, use the arrow keys, or double-click to reset. */
export function ResizeHandle({
  label,
  orientation,
  value,
  min,
  max,
  grow,
  onChange,
  onReset,
}: ResizeHandleProps) {
  const start = useRef<{ at: number; value: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const vertical = orientation === "vertical";
  const set = (px: number) => {
    onChange(Math.round(Math.min(max, Math.max(min, px))));
  };
  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={`Resize: ${label}`}
      aria-orientation={orientation}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      title={`Drag to resize the ${label.toLowerCase()} · double-click to reset`}
      data-testid={`resize-${vertical ? "side" : "dock"}`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { at: vertical ? e.clientX : e.clientY, value };
        setDragging(true);
      }}
      onPointerMove={(e) => {
        if (start.current === null) return;
        const at = vertical ? e.clientX : e.clientY;
        set(start.current.value + grow * (at - start.current.at));
      }}
      onPointerUp={(e) => {
        start.current = null;
        setDragging(false);
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => {
        start.current = null;
        setDragging(false);
      }}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        const bigger = vertical
          ? e.key === (grow === 1 ? "ArrowRight" : "ArrowLeft")
          : e.key === (grow === 1 ? "ArrowDown" : "ArrowUp");
        const smaller = vertical
          ? e.key === (grow === 1 ? "ArrowLeft" : "ArrowRight")
          : e.key === (grow === 1 ? "ArrowUp" : "ArrowDown");
        if (!bigger && !smaller && e.key !== "Home") return;
        e.preventDefault();
        e.stopPropagation();
        if (e.key === "Home") onReset();
        else set(value + (bigger ? PANEL_STEP / 3 : -PANEL_STEP / 3));
      }}
      className={`group relative shrink-0 touch-none select-none outline-none ${
        vertical ? "w-3 cursor-col-resize" : "h-2 cursor-row-resize"
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute rounded-full transition-colors ${
          vertical
            ? "inset-y-2 left-1/2 w-0.5 -translate-x-1/2"
            : "inset-x-0 top-1/2 h-0.5 -translate-y-1/2"
        } ${
          dragging
            ? "bg-sky-400"
            : "bg-transparent group-hover:bg-sky-500/70 group-focus-visible:bg-sky-400"
        }`}
      />
    </div>
  );
}
