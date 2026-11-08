import type { AnyAction } from "@lumacut/actions";
import { BlendMode, type Clip, type Composition, type Track } from "@lumacut/schema";
import { useState } from "react";
import { editingActions, type EditingContext } from "../../actions/editing.ts";
import { ActionButton } from "../ActionButton.tsx";
import { Icon } from "../Icon.tsx";

interface LayersPanelProps {
  composition: Composition;
  ctx: EditingContext;
  selectedClipIds: readonly string[];
  selectClips: (ids: string[]) => void;
  onRun: (action: AnyAction<EditingContext>, args?: unknown) => void;
  run: (id: string, args?: unknown) => Promise<string | null>;
  /** Opens the library so an image can be added as a layer. */
  onAddImage: () => void;
}

const ICON: Record<string, string> = {
  media: "image",
  paint: "brush",
  text: "text",
  caption: "text",
  shape: "shape",
  solid: "grid",
  adjustment: "effect",
  composition: "group",
};

const BLEND_LABEL = (mode: string): string =>
  mode.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());

/**
 * The layers of a photo, top of the stack first: show/hide, lock, name (double-click to rename),
 * drag to reorder, and the selected layer's opacity and blend mode. Every button is a registry
 * action, so the same things work from the palette and the keyboard.
 */
export function LayersPanel(props: LayersPanelProps) {
  const { composition, ctx, selectedClipIds, onRun } = props;
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const layers = composition.tracks
    .map((track, index) => ({ track, index }))
    .filter(({ track }) => track.kind === "visual")
    .reverse();
  const selected = new Set(selectedClipIds);
  const isSelected = (t: Track) => t.clips.some((c) => selected.has(c.id));
  const current: Clip | undefined = layers.find(({ track }) => isSelected(track))?.track.clips[0];
  const press = (e: React.MouseEvent) => {
    e.preventDefault();
  };
  const small = "text-neutral-300 hover:bg-neutral-800";

  return (
    <section aria-label="Layers" className="flex min-h-0 flex-col gap-2 p-3 text-xs">
      <div className="flex flex-wrap gap-1">
        <ActionButton
          action={editingActions.get("layer.addPaint")}
          ctx={ctx}
          onRun={onRun}
          className={small}
        />
        <button
          type="button"
          title="Add an image from your library as a new layer"
          onMouseDown={press}
          onClick={props.onAddImage}
          className="flex items-center gap-1 rounded px-2 py-1 text-neutral-300 hover:bg-neutral-800"
        >
          <Icon name="image" /> Image…
        </button>
        <ActionButton
          action={editingActions.get("layer.addAdjustment")}
          ctx={ctx}
          onRun={onRun}
          className={small}
        />
        <ActionButton
          action={editingActions.get("layer.addSolid")}
          ctx={ctx}
          onRun={onRun}
          className={small}
        />
        <ActionButton
          action={editingActions.get("text.add")}
          ctx={ctx}
          onRun={onRun}
          className={small}
        />
      </div>

      <ul aria-label="Layer stack" className="flex flex-col gap-0.5">
        {layers.length === 0 && (
          <li className="rounded border border-dashed border-neutral-700 p-3 text-neutral-500">
            No layers yet. Add an image, a paint layer or text above.
          </li>
        )}
        {layers.map(({ track, index }) => {
          const clip = track.clips[0];
          const active = isSelected(track);
          return (
            <li
              key={track.id}
              draggable={renaming !== track.id}
              data-testid="layer-row"
              data-selected={active}
              onDragStart={(e) => {
                setDragging(track.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (dragging === null) return;
                e.preventDefault();
                setOver(index);
              }}
              onDragLeave={() => {
                setOver(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging !== null)
                  void props.run("layer.moveTo", { trackId: dragging, position: index });
                setDragging(null);
                setOver(null);
              }}
              onDragEnd={() => {
                setDragging(null);
                setOver(null);
              }}
              onClick={() => {
                props.selectClips(track.clips.map((c) => c.id));
              }}
              className={`flex items-center gap-1 rounded border px-1 py-1 ${active ? "border-sky-500 bg-sky-950/40" : "border-transparent hover:bg-neutral-800"} ${over === index ? "border-t-2 border-t-sky-400" : ""} ${track.hidden ? "opacity-50" : ""}`}
            >
              <ActionButton
                action={editingActions.get("layer.toggleHidden")}
                ctx={ctx}
                variant="icon"
                args={{ trackId: track.id }}
                onRun={onRun}
                pressed={!track.hidden}
                className={small}
              />
              <span className="text-neutral-500" aria-hidden>
                <Icon name={ICON[clip?.type ?? "media"] ?? "layers"} />
              </span>
              {renaming === track.id ? (
                <input
                  autoFocus
                  aria-label="Layer name"
                  defaultValue={track.name}
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                  onBlur={(e) => {
                    const name = e.target.value.trim();
                    setRenaming(null);
                    if (name !== "" && name !== track.name)
                      void props.run("layer.rename", { trackId: track.id, name });
                  }}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") setRenaming(null);
                  }}
                  className="min-w-0 flex-1 rounded border border-neutral-600 bg-neutral-950 px-1 py-0.5 text-neutral-100"
                />
              ) : (
                <span
                  className="min-w-0 flex-1 truncate text-neutral-100"
                  onDoubleClick={() => {
                    if (clip?.type === "composition") {
                      onRun(editingActions.get("composition.open"), {
                        composition: clip.compositionId,
                      });
                    } else {
                      setRenaming(track.id);
                    }
                  }}
                  title="Double-click to rename (a group opens instead)"
                >
                  {track.name}
                </span>
              )}
              <ActionButton
                action={editingActions.get("layer.toggleLocked")}
                ctx={ctx}
                variant="icon"
                args={{ trackId: track.id }}
                onRun={onRun}
                pressed={track.locked}
                className={small}
              />
            </li>
          );
        })}
      </ul>

      {current !== undefined && (
        <div className="flex flex-col gap-2 rounded border border-neutral-800 p-2">
          <label className="flex items-center gap-2 text-neutral-300">
            Opacity
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(current.opacity * 100)}
              aria-label="Layer opacity"
              onChange={(e) => {
                void props.run("layer.setOpacity", { opacity: Number(e.target.value) / 100 });
              }}
              className="flex-1"
            />
            <span className="w-9 text-right tabular-nums text-neutral-400">
              {Math.round(current.opacity * 100)}%
            </span>
          </label>
          <label className="flex items-center gap-2 text-neutral-300">
            Blend
            <select
              aria-label="Layer blend mode"
              value={current.blendMode}
              onChange={(e) => {
                void props.run("layer.setBlend", { mode: e.target.value });
              }}
              className="flex-1 rounded border border-neutral-700 bg-neutral-950 px-1 py-1 text-neutral-100"
            >
              {BlendMode.options.map((mode) => (
                <option key={mode} value={mode}>
                  {BLEND_LABEL(mode)}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className="flex flex-wrap gap-0.5 border-t border-neutral-800 pt-2">
        {(
          [
            "layer.moveUp",
            "layer.moveDown",
            "layer.duplicate",
            "layer.group",
            "layer.ungroup",
            "layer.delete",
          ] as const
        ).map((id) => (
          <ActionButton
            key={id}
            action={editingActions.get(id)}
            ctx={ctx}
            variant="icon"
            onRun={onRun}
            className={small}
          />
        ))}
      </div>
    </section>
  );
}
