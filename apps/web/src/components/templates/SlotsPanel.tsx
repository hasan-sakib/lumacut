import type { Project } from "@lumacut/schema";
import { projectSlots, slotColor, slotText } from "@lumacut/templates";
import { useState } from "react";
import type { AssetOut } from "../../api/client.ts";

interface SlotsPanelProps {
  project: Project;
  /** Ready library assets (photos and videos are offered for media slots). */
  library: readonly AssetOut[];
  run: (id: string, args?: unknown) => Promise<string | null>;
  selectClips: (ids: string[]) => void;
  /** Opens the library to upload more media. */
  onUpload: () => void;
}

const hex = (c: { r: number; g: number; b: number } | undefined): string =>
  c === undefined
    ? "#ffffff"
    : `#${[c.r, c.g, c.b]
        .map((v) =>
          Math.round(v * 255)
            .toString(16)
            .padStart(2, "0"),
        )
        .join("")}`;

/**
 * The slots of a project made from a template: put in your photos and videos, type your words,
 * pick your colours. Everything else (motion, timing, style) stays as designed.
 */
export function SlotsPanel({ project, library, run, selectClips, onUpload }: SlotsPanelProps) {
  const slots = projectSlots(project);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const media = library.filter((a) => a.kind === "image" || a.kind === "video");
  const call = async (id: string, args: unknown) => {
    setError(await run(id, args));
  };
  if (slots.length === 0) {
    return (
      <p className="p-3 text-xs text-neutral-500">
        This project has no template slots. In Pro mode, select clips and use “Make a template
        slot”, then “Save as template”.
      </p>
    );
  }
  const filled = slots.filter((s) => s.filled).length;
  return (
    <section aria-label="Template slots" className="flex flex-col gap-3 p-3 text-xs">
      <p className="text-neutral-400">
        {filled} of {slots.length} slots filled. Click a slot to select it on the timeline.
      </p>
      {error !== null && (
        <p role="alert" className="rounded bg-red-950/60 px-2 py-1 text-red-300">
          {error}
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {slots.map((slot) => (
          <li
            key={`${slot.compositionId}/${slot.slotId}`}
            data-testid="slot"
            className={`rounded border p-2 ${slot.filled ? "border-neutral-800" : "border-amber-700/70"}`}
          >
            <button
              type="button"
              title="Select this slot's clip"
              onClick={() => {
                selectClips([slot.clip.id]);
              }}
              className="mb-1 flex w-full items-center gap-2 text-left"
            >
              <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] uppercase text-neutral-400">
                {slot.kind}
              </span>
              <span className="flex-1 truncate font-medium text-neutral-100">{slot.label}</span>
              {!slot.filled && <span className="text-amber-400">empty</span>}
            </button>
            {slot.kind === "media" && (
              <div className="flex gap-1">
                <select
                  aria-label={`Media for ${slot.label}`}
                  value=""
                  onChange={(e) => {
                    if (e.target.value !== "") {
                      void call("template.replaceMedia", {
                        slot: slot.slotId,
                        asset: e.target.value,
                      });
                    }
                  }}
                  className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-950 px-1 py-1 text-neutral-100"
                >
                  <option value="">
                    {slot.filled ? "Replace with…" : "Choose a photo or video…"}
                  </option>
                  {media.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.kind === "video" ? "🎬 " : "🖼 "}
                      {a.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  title="Upload new photos or videos to your library"
                  onClick={onUpload}
                  className="rounded bg-neutral-800 px-2 py-1 hover:bg-neutral-700"
                >
                  Upload
                </button>
              </div>
            )}
            {slot.kind === "text" && (
              <form
                className="flex flex-col gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  const text = drafts[slot.slotId];
                  if (text !== undefined)
                    void call("template.setText", { slot: slot.slotId, text });
                }}
              >
                <textarea
                  aria-label={slot.label}
                  rows={slot.clip.type === "caption" ? 3 : 1}
                  value={drafts[slot.slotId] ?? slotText(slot.clip)}
                  onChange={(e) => {
                    setDrafts((d) => ({ ...d, [slot.slotId]: e.target.value }));
                  }}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter" && !e.shiftKey && slot.clip.type !== "caption") {
                      e.preventDefault();
                      e.currentTarget.form?.requestSubmit();
                    }
                  }}
                  className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-neutral-100"
                />
                <button
                  type="submit"
                  disabled={drafts[slot.slotId] === undefined}
                  className="self-end rounded bg-sky-700 px-2 py-0.5 text-white hover:bg-sky-600 disabled:opacity-40"
                >
                  Apply
                </button>
              </form>
            )}
            {slot.kind === "color" && (
              <input
                type="color"
                aria-label={slot.label}
                value={hex(slotColor(slot.clip))}
                onChange={(e) => {
                  void call("template.setColor", { slot: slot.slotId, color: e.target.value });
                }}
                className="h-7 w-12 cursor-pointer rounded border border-neutral-700 bg-transparent"
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
