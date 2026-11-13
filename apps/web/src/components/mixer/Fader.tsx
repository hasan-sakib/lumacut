import { useState } from "react";

const MIN_DB = -60;
const MAX_DB = 12;

export const gainToDb = (gain: number): number =>
  gain <= 0 ? MIN_DB : Math.max(MIN_DB, 20 * Math.log10(gain));
export const dbToGain = (db: number): number => (db <= MIN_DB ? 0 : 10 ** (db / 20));

interface FaderProps {
  label: string;
  /** Linear gain. */
  gain: number;
  /** While dragging: the sound follows at once (nothing is saved). */
  onPreview: (gain: number) => void;
  /** On release: the value to keep (one undo step). */
  onCommit: (db: number) => void;
}

/**
 * A vertical volume fader in dB (−60 … +12, double-click for 0 dB). Dragging moves the sound live;
 * letting go saves it once, so a drag is one undo step.
 */
export function Fader({ label, gain, onPreview, onCommit }: FaderProps) {
  const [draft, setDraft] = useState<number | null>(null);
  const db = draft ?? gainToDb(gain);
  const commit = () => {
    if (draft !== null) onCommit(draft);
    setDraft(null);
  };
  return (
    <div className="flex h-full flex-col items-center gap-1">
      <input
        type="range"
        min={MIN_DB}
        max={MAX_DB}
        step={0.5}
        value={db}
        aria-label={label}
        aria-valuetext={`${db.toFixed(1)} dB`}
        title={`${label}: ${db.toFixed(1)} dB (double-click for 0 dB)`}
        onChange={(e) => {
          const next = Number(e.target.value);
          setDraft(next);
          onPreview(dbToGain(next));
        }}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        onDoubleClick={() => {
          onPreview(1);
          onCommit(0);
          setDraft(null);
        }}
        className="min-h-0 flex-1 cursor-pointer [writing-mode:vertical-lr] [direction:rtl]"
      />
      <span className="text-[10px] tabular-nums text-neutral-400">
        {db <= MIN_DB ? "−∞" : `${db > 0 ? "+" : ""}${db.toFixed(1)}`}
      </span>
    </div>
  );
}
