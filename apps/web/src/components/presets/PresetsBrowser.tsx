import { MOTION_PRESETS, type PresetCategory } from "@lumacut/ops";
import { useState } from "react";

interface PresetsBrowserProps {
  /** A picture clip is selected. */
  canApply: boolean;
  /** A text or caption clip is selected (text presets). */
  hasText: boolean;
  /** Runs an action by id; resolves with an error message or null. */
  run: (id: string, args?: unknown) => Promise<string | null>;
}

const CATEGORIES: readonly PresetCategory[] = ["In", "Out", "Emphasis", "Text"];
const NOTES: Record<PresetCategory, string> = {
  In: "Placed at the start of the clip.",
  Out: "Placed at the end of the clip.",
  Emphasis: "Placed at the playhead.",
  Text: "Per-letter and per-word reveals for text and captions.",
};

/** Motion presets: one click adds ordinary keyframes (or a text animator) to the selection. */
export function PresetsBrowser({ canApply, hasText, run }: PresetsBrowserProps) {
  const [intensity, setIntensity] = useState(1);
  const [seconds, setSeconds] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const apply = async (preset: string) => {
    const length = Number(seconds);
    const message = await run("preset.apply", {
      preset,
      intensity,
      ...(seconds.trim() !== "" && Number.isFinite(length) && length > 0
        ? { durationUs: Math.round(length * 1_000_000) }
        : {}),
    });
    setError(message ?? null);
  };
  return (
    <section aria-label="Motion presets" className="flex flex-col gap-3 p-3 text-xs">
      <p className="text-neutral-400">
        Select a clip, then pick a preset. Everything it adds is a normal keyframe: edit it in the
        Inspector or the graph editor.
      </p>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1 text-neutral-300">
          Strength
          <input
            type="range"
            min={0.25}
            max={3}
            step={0.25}
            value={intensity}
            aria-label="Preset strength"
            onChange={(e) => {
              setIntensity(Number(e.target.value));
            }}
          />
          <span className="w-8 tabular-nums text-neutral-400">{intensity}×</span>
        </label>
        <label className="flex items-center gap-1 text-neutral-300">
          Length (s)
          <input
            type="number"
            min={0.1}
            step={0.1}
            value={seconds}
            placeholder="auto"
            aria-label="Preset length in seconds"
            onChange={(e) => {
              setSeconds(e.target.value);
            }}
            className="w-14 rounded border border-neutral-700 bg-neutral-950 px-1 py-0.5 text-neutral-100"
          />
        </label>
      </div>
      {error !== null && (
        <p role="alert" className="rounded bg-red-950/60 px-2 py-1 text-red-300">
          {error}
        </p>
      )}
      {CATEGORIES.map((category) => (
        <div key={category} className="flex flex-col gap-1">
          <h3 className="font-semibold text-neutral-300">
            {category} <span className="font-normal text-neutral-500">{NOTES[category]}</span>
          </h3>
          <div className="flex flex-wrap gap-1">
            {MOTION_PRESETS.filter((p) => p.category === category).map((preset) => (
              <button
                key={preset.id}
                type="button"
                disabled={!(category === "Text" ? hasText : canApply)}
                title={preset.description}
                onMouseDown={(e) => {
                  e.preventDefault();
                }}
                onClick={() => void apply(preset.id)}
                className="rounded bg-neutral-800 px-2 py-1 text-neutral-200 hover:bg-neutral-700 disabled:opacity-40"
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
