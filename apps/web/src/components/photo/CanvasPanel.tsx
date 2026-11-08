import { useState } from "react";
import type { Anchor } from "../../photo/canvas-ops.ts";

interface CanvasPanelProps {
  canvas: { width: number; height: number };
  run: (id: string, args?: unknown) => Promise<string | null>;
}

const BUTTON =
  "rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-700 disabled:opacity-40";
const INPUT =
  "w-20 rounded border border-neutral-700 bg-neutral-950 px-1 py-0.5 text-xs text-neutral-100";

const ANCHORS: Anchor[] = [
  "topLeft",
  "top",
  "topRight",
  "left",
  "center",
  "right",
  "bottomLeft",
  "bottom",
  "bottomRight",
];

/** Canvas size and orientation: resize (with the picture anchored where you choose), rotate, flip. */
export function CanvasPanel({ canvas, run }: CanvasPanelProps) {
  const [width, setWidth] = useState(String(canvas.width));
  const [height, setHeight] = useState(String(canvas.height));
  const [anchor, setAnchor] = useState<Anchor>("center");
  const [scaleContent, setScaleContent] = useState(false);
  const [lock, setLock] = useState(true);
  const press = (e: React.MouseEvent) => {
    e.preventDefault();
  };
  const w = Number(width);
  const h = Number(height);
  const valid =
    Number.isInteger(w) && Number.isInteger(h) && w >= 1 && h >= 1 && w <= 16384 && h <= 16384;
  const ratio = canvas.width / canvas.height;
  return (
    <section aria-label="Canvas" className="flex flex-col gap-3 p-3 text-xs">
      <p className="text-neutral-400">
        Canvas: {canvas.width} × {canvas.height} px
      </p>
      <div className="flex flex-col gap-2">
        <h3 className="font-semibold text-neutral-300">Canvas size</h3>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-neutral-300">
            W
            <input
              type="number"
              min={1}
              max={16384}
              value={width}
              aria-label="New canvas width"
              onChange={(e) => {
                setWidth(e.target.value);
                if (lock)
                  setHeight(String(Math.max(1, Math.round(Number(e.target.value) / ratio))));
              }}
              className={INPUT}
            />
          </label>
          <label className="flex items-center gap-1 text-neutral-300">
            H
            <input
              type="number"
              min={1}
              max={16384}
              value={height}
              aria-label="New canvas height"
              onChange={(e) => {
                setHeight(e.target.value);
                if (lock) setWidth(String(Math.max(1, Math.round(Number(e.target.value) * ratio))));
              }}
              className={INPUT}
            />
          </label>
          <label className="flex items-center gap-1 text-neutral-400">
            <input
              type="checkbox"
              checked={lock}
              onChange={(e) => {
                setLock(e.target.checked);
              }}
            />
            Keep shape
          </label>
        </div>
        <div className="flex items-center gap-3">
          <div role="radiogroup" aria-label="Anchor" className="grid grid-cols-3 gap-0.5">
            {ANCHORS.map((a) => (
              <button
                key={a}
                type="button"
                role="radio"
                aria-checked={anchor === a}
                aria-label={`Anchor ${a}`}
                title={`Keep the picture at the ${a === "center" ? "centre" : a.replace(/([A-Z])/g, " $1").toLowerCase()}`}
                onMouseDown={press}
                onClick={() => {
                  setAnchor(a);
                }}
                className={`h-4 w-4 rounded-sm border ${anchor === a ? "border-sky-400 bg-sky-500" : "border-neutral-600 bg-neutral-800"}`}
              />
            ))}
          </div>
          <label className="flex items-center gap-1 text-neutral-300">
            <input
              type="checkbox"
              checked={scaleContent}
              onChange={(e) => {
                setScaleContent(e.target.checked);
              }}
            />
            Scale the picture to fit
          </label>
        </div>
        <button
          type="button"
          className={`${BUTTON} self-start !bg-sky-700 text-white`}
          disabled={!valid}
          onMouseDown={press}
          onClick={() => void run("canvas.resize", { width: w, height: h, anchor, scaleContent })}
        >
          Resize canvas
        </button>
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="font-semibold text-neutral-300">Rotate and flip</h3>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            className={BUTTON}
            onMouseDown={press}
            onClick={() => void run("canvas.rotateLeft")}
          >
            ⟲ Rotate left
          </button>
          <button
            type="button"
            className={BUTTON}
            onMouseDown={press}
            onClick={() => void run("canvas.rotateRight")}
          >
            ⟳ Rotate right
          </button>
          <button
            type="button"
            className={BUTTON}
            onMouseDown={press}
            onClick={() => void run("canvas.flip", { axis: "horizontal" })}
          >
            Flip ↔
          </button>
          <button
            type="button"
            className={BUTTON}
            onMouseDown={press}
            onClick={() => void run("canvas.flip", { axis: "vertical" })}
          >
            Flip ↕
          </button>
        </div>
        <p className="text-neutral-500">
          Crop and straighten are in the Crop tool (Alt+C). Everything here can be undone.
        </p>
      </div>
    </section>
  );
}
