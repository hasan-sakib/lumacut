import { TRANSITIONS, transitionById } from "@lumacut/effects";
import type { Op, TransitionAlignment } from "@lumacut/schema";
import { fieldStateFor, opForField } from "../../inspector/selection.ts";
import type { ClipInfo } from "../../inspector/fields.ts";
import {
  US,
  maxTransitionUs,
  removeTransitionOp,
  touchingPrevious,
  updateTransitionOp,
} from "../../inspector/transition-ops.ts";
import { transitionRows } from "../../inspector/transitions.ts";
import { FieldRow } from "../inspector/FieldRow.tsx";
import { ScrubNumber } from "../inspector/ScrubNumber.tsx";
import { Section } from "../inspector/Section.tsx";
import { useState } from "react";

interface TransitionInspectorProps {
  item: ClipInfo;
  playheadUs: number;
  onChange: (op: Op, coalesceKey: string | undefined) => void;
}

const ALIGNMENTS: [TransitionAlignment, string][] = [
  ["center", "Centred on the cut"],
  ["start", "Starts at the cut"],
  ["end", "Ends at the cut"],
];

/** The transition at the start of the clip: its type, length, placement and settings. */
export function TransitionInspector({ item, playheadUs, onChange }: TransitionInspectorProps) {
  const [open, setOpen] = useState(true);
  const { clip, track } = item;
  const transition = clip.transitionIn;
  if (transition === undefined || track === undefined) return null;
  const def = transitionById(transition.transitionId);
  const previous = touchingPrevious(track, clip);
  const max =
    previous === undefined
      ? transition.durationUs
      : maxTransitionUs(previous, clip, transition.alignment);
  const items = [item];
  const apply = (op: Op | null, key?: string) => {
    if (op !== null) onChange(op, key);
  };
  return (
    <Section
      id="transition"
      title="Transition"
      open={open}
      onToggle={() => {
        setOpen((o) => !o);
      }}
      hasAdvanced={false}
      hiddenAdvanced={0}
      advanced={false}
      onToggleAdvanced={() => undefined}
      searching={false}
    >
      {previous === undefined && (
        <p role="alert" className="text-xs text-amber-300">
          The clip before this one no longer touches it, so this is a plain cut.
        </p>
      )}
      <label className="grid grid-cols-[1.25rem_6rem_1fr] items-center gap-2 text-xs text-neutral-300">
        <span />
        <span>Type</span>
        <select
          aria-label="Transition type"
          value={transition.transitionId}
          onChange={(e) => {
            apply(updateTransitionOp(track, clip, { transitionId: e.target.value }));
          }}
          className="rounded border border-neutral-700 bg-neutral-950 px-1.5 py-1 text-neutral-100"
        >
          {def === undefined && (
            <option value={transition.transitionId}>Unknown: {transition.transitionId}</option>
          )}
          {TRANSITIONS.map((t) => (
            <option key={t.id} value={t.id} title={t.description}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <ScrubNumber
        label="Duration"
        value={transition.durationUs / US}
        unit="s"
        step={0.05}
        min={0.05}
        max={Math.max(0.05, max / US)}
        onCommit={(v, source) => {
          apply(
            updateTransitionOp(track, clip, { durationUs: Math.round(v * US) }),
            source === "type" ? undefined : "transition:duration",
          );
        }}
      />
      <label className="grid grid-cols-[1.25rem_6rem_1fr] items-center gap-2 text-xs text-neutral-300">
        <span />
        <span>Placement</span>
        <select
          aria-label="Transition placement"
          value={transition.alignment}
          onChange={(e) => {
            apply(
              updateTransitionOp(track, clip, { alignment: e.target.value as TransitionAlignment }),
            );
          }}
          className="rounded border border-neutral-700 bg-neutral-950 px-1.5 py-1 text-neutral-100"
        >
          {ALIGNMENTS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {def !== undefined &&
        transitionRows(transition, def).map((row) =>
          row.type === "field" ? (
            <FieldRow
              key={row.field.id}
              field={fieldStateFor(row.field, items, playheadUs)}
              onChange={(stored, source) => {
                const op = opForField(row.field, stored, items, playheadUs);
                apply(
                  op,
                  source === "scrub" || source === "step" ? `inspector:${row.field.id}` : undefined,
                );
              }}
            />
          ) : null,
        )}
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
        }}
        onClick={() => {
          onChange(removeTransitionOp(clip.id), undefined);
        }}
        className="self-start rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-700"
      >
        Remove transition
      </button>
    </Section>
  );
}
