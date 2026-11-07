import type { FieldState } from "../../inspector/selection.ts";
import type { FieldValue } from "../../inspector/fields.ts";
import { ScrubNumber, type NumberSource } from "./ScrubNumber.tsx";

interface FieldRowProps {
  field: FieldState;
  /** Called with the new *stored* value (display conversion already undone). */
  onChange: (stored: FieldValue, source: NumberSource | "choice") => void;
}

/** One inspector row, chosen by the field's kind. Display units are converted here. */
export function FieldRow({ field, onChange }: FieldRowProps) {
  const { def, value, mixed } = field;
  if (def.kind === "number") {
    const shown =
      typeof value === "number" ? (def.toDisplay ? def.toDisplay(value) : value) : undefined;
    return (
      <ScrubNumber
        label={def.label}
        value={shown}
        mixed={mixed}
        unit={def.unit}
        step={def.step ?? 1}
        min={def.min}
        max={def.max}
        readOnly={def.readOnly}
        onCommit={(display, source) => {
          onChange(def.fromDisplay ? def.fromDisplay(display) : display, source);
        }}
      />
    );
  }
  if (def.kind === "enum") {
    return (
      <label className="grid grid-cols-[7rem_1fr] items-center gap-2 text-xs text-neutral-300">
        <span>{def.label}</span>
        <select
          value={mixed ? "" : String(value)}
          onChange={(e) => {
            if (e.target.value !== "") onChange(e.target.value, "choice");
          }}
          className="rounded border border-neutral-700 bg-neutral-950 px-1.5 py-1 text-neutral-100"
        >
          {mixed && <option value="">Mixed</option>}
          {def.options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <label className="grid grid-cols-[7rem_1fr] items-center gap-2 text-xs text-neutral-300">
      <span>{def.label}</span>
      <input
        type="checkbox"
        checked={value === true}
        ref={(el) => {
          if (el !== null) el.indeterminate = mixed;
        }}
        onChange={(e) => {
          onChange(e.target.checked, "choice");
        }}
        className="h-4 w-4 accent-sky-500"
      />
    </label>
  );
}
