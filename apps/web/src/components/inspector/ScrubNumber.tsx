import { useEffect, useRef, useState } from "react";
import { clampTo, evaluateInput, tidy } from "../../inspector/evaluate.ts";

export type NumberSource = "scrub" | "step" | "type";

interface ScrubNumberProps {
  label: string;
  /** In display units; undefined when the selected clips disagree. */
  value: number | undefined;
  mixed?: boolean;
  unit?: string | undefined;
  step: number;
  min?: number | undefined;
  max?: number | undefined;
  readOnly?: boolean | undefined;
  onCommit: (value: number, source: NumberSource) => void;
}

const format = (v: number): string => String(tidy(v, 2));

/**
 * A number you can type into (`12`, `+10`, `*2`), step with ↑/↓ (Shift ×10, Alt ×0.1) or scrub by
 * dragging its label (1 px = one step). Enter or leaving the box applies a typed value, Esc puts
 * the old one back, and something that isn't a number is explained and never applied.
 */
export function ScrubNumber({
  label,
  value,
  mixed = false,
  unit,
  step,
  min,
  max,
  readOnly = false,
  onCommit,
}: ScrubNumberProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef({ value, step, min, max, onCommit });
  useEffect(() => {
    latest.current = { value, step, min, max, onCommit };
  });

  const shown = draft ?? (value === undefined ? "" : format(value));
  const multiplier = (e: { shiftKey: boolean; altKey: boolean }) =>
    e.shiftKey ? 10 : e.altKey ? 0.1 : 1;

  function apply(next: number, source: NumberSource) {
    onCommit(tidy(clampTo(next, min, max), 4), source);
  }

  function commitDraft() {
    if (draft === null) return;
    const result = evaluateInput(value ?? 0, draft);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setError(null);
    setDraft(null);
    apply(result.value, "type");
  }

  // Scrubbing: drag the label; the pointer may leave it.
  const [scrub, setScrub] = useState<{ startX: number; startValue: number } | null>(null);
  useEffect(() => {
    if (scrub === null) return;
    const move = (e: PointerEvent) => {
      const { step: s, min: lo, max: hi, onCommit: commit } = latest.current;
      commit(
        tidy(clampTo(scrub.startValue + (e.clientX - scrub.startX) * s * multiplier(e), lo, hi), 4),
        "scrub",
      );
    };
    const up = () => {
      setScrub(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [scrub]);

  if (readOnly) {
    return (
      <div className="grid grid-cols-[7rem_1fr] items-center gap-2 text-xs">
        <span className="text-neutral-400">{label}</span>
        <span
          className="font-mono text-neutral-300"
          aria-label={label}
          data-testid={`field-${label}`}
        >
          {value === undefined ? "Mixed" : `${format(value)}${unit ? ` ${unit}` : ""}`}
        </span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[7rem_1fr] items-center gap-2 text-xs">
      <span
        data-scrub={label}
        className="cursor-ew-resize select-none text-neutral-300"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          setScrub({ startX: e.clientX, startValue: value ?? 0 });
        }}
      >
        {label}
      </span>
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1">
          <input
            type="text"
            inputMode="decimal"
            aria-label={label}
            aria-invalid={error !== null}
            value={shown}
            placeholder={mixed ? "Mixed" : ""}
            onFocus={(e) => {
              e.currentTarget.select();
            }}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitDraft();
              } else if (e.key === "Escape") {
                e.stopPropagation();
                setDraft(null);
                setError(null);
              } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                e.preventDefault();
                e.stopPropagation();
                setDraft(null);
                apply((value ?? 0) + (e.key === "ArrowUp" ? 1 : -1) * step * multiplier(e), "step");
              }
            }}
            className="w-full rounded border border-neutral-700 bg-neutral-950 px-1.5 py-1 font-mono text-neutral-100 outline-none focus:border-sky-500 aria-[invalid=true]:border-red-500"
          />
          {unit !== undefined && <span className="w-6 text-neutral-500">{unit}</span>}
        </div>
        {error !== null && (
          <span role="alert" className="text-red-300">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
