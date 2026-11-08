import { useMemo } from "react";
import { fitAspect } from "../../photo/crop.ts";
import type { BrushSettings, Selection } from "../../photo/types.ts";
import type { CanvasTool } from "../../stores/editor.ts";
import { usePhotoStore } from "../../stores/photo.ts";

interface ToolOptionsProps {
  canvasTool: CanvasTool;
  canvas: { width: number; height: number };
  brush: BrushSettings;
  selection: Selection | null;
  /** A layer is selected (so a selection can become its mask, the mask brush has a target). */
  hasLayer: boolean;
  setBrush: (patch: Partial<BrushSettings>) => void;
  run: (id: string, args?: unknown) => Promise<string | null>;
}

const BUTTON =
  "rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-700 disabled:opacity-40";
const FIELD = "flex items-center gap-1 text-xs text-neutral-300";
const INPUT =
  "w-14 rounded border border-neutral-700 bg-neutral-950 px-1 py-0.5 text-xs text-neutral-100";

const hex = (c: BrushSettings["color"]): string =>
  `#${[c.r, c.g, c.b]
    .map((v) =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;

const ASPECTS: { label: string; value: number | "original" | null }[] = [
  { label: "Free", value: null },
  { label: "Original", value: "original" },
  { label: "1:1", value: 1 },
  { label: "4:3", value: 4 / 3 },
  { label: "3:2", value: 3 / 2 },
  { label: "16:9", value: 16 / 9 },
  { label: "9:16", value: 9 / 16 },
];

/** The options of the current tool, in a bar above the canvas. */
export function ToolOptions(props: ToolOptionsProps) {
  const { canvasTool, brush, selection, canvas } = props;
  const photo = usePhotoStore();
  const press = (e: React.MouseEvent) => {
    e.preventDefault();
  };
  const call = (id: string, args?: unknown) => () => void props.run(id, args);

  const brushControls = useMemo(
    () => (
      <>
        <label className={FIELD}>
          Size
          <input
            type="range"
            min={1}
            max={500}
            value={brush.size}
            aria-label="Brush size"
            onChange={(e) => {
              props.setBrush({ size: Number(e.target.value) });
            }}
          />
          <span className="w-8 tabular-nums text-neutral-400">{brush.size}</span>
        </label>
        <label className={FIELD}>
          Hardness
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(brush.hardness * 100)}
            aria-label="Brush hardness"
            onChange={(e) => {
              props.setBrush({ hardness: Number(e.target.value) / 100 });
            }}
          />
          <span className="w-8 tabular-nums text-neutral-400">
            {Math.round(brush.hardness * 100)}%
          </span>
        </label>
        <label className={FIELD}>
          Opacity
          <input
            type="range"
            min={1}
            max={100}
            value={Math.round(brush.opacity * 100)}
            aria-label="Brush opacity"
            onChange={(e) => {
              props.setBrush({ opacity: Number(e.target.value) / 100 });
            }}
          />
          <span className="w-8 tabular-nums text-neutral-400">
            {Math.round(brush.opacity * 100)}%
          </span>
        </label>
      </>
    ),
    // setBrush is stable (a store setter).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [brush.size, brush.hardness, brush.opacity],
  );

  let body: React.ReactNode;
  if (canvasTool === "brush" || canvasTool === "eraser") {
    body = (
      <>
        {brushControls}
        {canvasTool === "brush" && (
          <label className={FIELD}>
            Colour
            <input
              type="color"
              value={hex(brush.color)}
              aria-label="Brush colour"
              onChange={(e) => {
                void props.run("brush.set", { color: e.target.value });
              }}
              className="h-6 w-8 cursor-pointer rounded border border-neutral-700 bg-transparent"
            />
          </label>
        )}
        <button type="button" className={BUTTON} onMouseDown={press} onClick={call("paint.clear")}>
          Clear layer
        </button>
      </>
    );
  } else if (canvasTool === "maskBrush") {
    body = (
      <>
        {brushControls}
        <div role="group" aria-label="Mask brush mode" className="flex gap-0.5">
          {(["reveal", "hide"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={photo.maskMode === mode}
              onMouseDown={press}
              onClick={() => {
                photo.setMaskMode(mode);
              }}
              className={`${BUTTON} ${photo.maskMode === mode ? "!bg-sky-700 text-white" : ""}`}
            >
              {mode === "reveal" ? "Reveal" : "Hide"}
            </button>
          ))}
        </div>
        <span className="text-xs text-neutral-400" aria-live="polite">
          {!props.hasLayer
            ? "Select a layer to mask."
            : photo.maskStatus.state === "saving"
              ? "Saving mask…"
              : photo.maskStatus.state === "dirty"
                ? "Unsaved mask edits (saved a moment after you stop)"
                : photo.maskStatus.state === "error"
                  ? `Couldn't save: ${photo.maskStatus.message}`
                  : "Hold Alt to do the opposite for one stroke."}
        </span>
      </>
    );
  } else if (
    canvasTool === "marqueeRect" ||
    canvasTool === "marqueeEllipse" ||
    canvasTool === "lasso"
  ) {
    const has = selection !== null;
    body = (
      <>
        <label className={FIELD}>
          Feather
          <input
            type="number"
            min={0}
            max={1000}
            value={selection?.feather ?? 0}
            disabled={!has}
            aria-label="Selection feather in pixels"
            onChange={(e) => {
              void props.run("marquee.feather", { pixels: Math.max(0, Number(e.target.value)) });
            }}
            className={INPUT}
          />
          px
        </label>
        <button
          type="button"
          className={BUTTON}
          disabled={!has}
          onMouseDown={press}
          onClick={call("marquee.invert")}
        >
          Invert
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={!has || !props.hasLayer}
          onMouseDown={press}
          onClick={call("marquee.toMask")}
        >
          To mask
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={!has || !props.hasLayer}
          onMouseDown={press}
          onClick={call("marquee.toMask", { mode: "subtract" })}
        >
          Cut out
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={!has}
          onMouseDown={press}
          onClick={call("canvas.cropToSelection")}
        >
          Crop to selection
        </button>
        <button
          type="button"
          className={BUTTON}
          onMouseDown={press}
          onClick={call("marquee.selectAll")}
        >
          Select all
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={!has}
          onMouseDown={press}
          onClick={call("marquee.clear")}
        >
          Deselect
        </button>
      </>
    );
  } else if (canvasTool === "crop") {
    const box = photo.crop;
    body = (
      <>
        <label className={FIELD}>
          Shape
          <select
            aria-label="Crop proportions"
            value={ASPECTS.findIndex((a) =>
              a.value === "original"
                ? photo.cropAspect === canvas.width / canvas.height
                : a.value === photo.cropAspect,
            )}
            onChange={(e) => {
              const choice = ASPECTS[Number(e.target.value)];
              if (choice === undefined) return;
              const aspect =
                choice.value === "original" ? canvas.width / canvas.height : choice.value;
              photo.setCropAspect(aspect);
              if (aspect !== null) photo.setCrop(fitAspect(canvas, aspect));
            }}
            className="rounded border border-neutral-700 bg-neutral-950 px-1 py-0.5 text-xs text-neutral-100"
          >
            {ASPECTS.map((a, i) => (
              <option key={a.label} value={i}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={`${BUTTON} !bg-sky-700 text-white`}
          disabled={box === null}
          onMouseDown={press}
          onClick={() => {
            if (box === null) return;
            void props
              .run("canvas.crop", {
                x: Math.round(box.x),
                y: Math.round(box.y),
                width: Math.round(box.width),
                height: Math.round(box.height),
              })
              .then((error) => {
                if (error === null) photo.setCrop({ x: 0, y: 0, width: 0, height: 0 });
              });
          }}
        >
          Apply crop
        </button>
        <label className={FIELD}>
          Straighten
          <input
            type="range"
            min={-45}
            max={45}
            step={0.1}
            value={photo.straighten}
            aria-label="Straighten angle"
            onChange={(e) => {
              photo.setStraighten(Number(e.target.value));
            }}
          />
          <span className="w-12 tabular-nums text-neutral-400">{photo.straighten.toFixed(1)}°</span>
        </label>
        <button
          type="button"
          className={BUTTON}
          disabled={photo.straighten === 0}
          onMouseDown={press}
          onClick={() => {
            void props.run("canvas.straighten", { degrees: photo.straighten }).then((error) => {
              if (error === null) photo.setStraighten(0);
            });
          }}
        >
          Apply straighten
        </button>
        <button
          type="button"
          className={BUTTON}
          onMouseDown={press}
          onClick={call("canvas.rotateLeft")}
        >
          ⟲ 90°
        </button>
        <button
          type="button"
          className={BUTTON}
          onMouseDown={press}
          onClick={call("canvas.rotateRight")}
        >
          ⟳ 90°
        </button>
        <button
          type="button"
          className={BUTTON}
          onMouseDown={press}
          onClick={call("canvas.flip", { axis: "horizontal" })}
        >
          Flip ↔
        </button>
        <button
          type="button"
          className={BUTTON}
          onMouseDown={press}
          onClick={call("canvas.flip", { axis: "vertical" })}
        >
          Flip ↕
        </button>
      </>
    );
  } else {
    body = (
      <span className="text-xs text-neutral-400">
        {canvas.width} × {canvas.height} px. Pick a tool on the left, or select a layer to move it.
      </span>
    );
  }
  return (
    <div
      role="toolbar"
      aria-label="Tool options"
      className="flex min-h-9 flex-wrap items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-1.5"
    >
      {body}
    </div>
  );
}
