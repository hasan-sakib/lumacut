import type { Composition, Op } from "@lumacut/schema";
import { useMemo, useState } from "react";
import type { ClipInfo, FieldValue, SectionId } from "../../inspector/fields.ts";
import { buildInspector, opForField } from "../../inspector/selection.ts";
import { formatDuration } from "../../lib/format.ts";
import { FieldRow } from "./FieldRow.tsx";
import { Section } from "./Section.tsx";

interface InspectorProps {
  composition: Composition;
  /** The selected clips with their track and asset. */
  items: readonly ClipInfo[];
  /** Apply a change; edits of the same field close together share `coalesceKey` (one undo step). */
  onChange: (op: Op, coalesceKey: string | undefined) => void;
}

/**
 * Shows only the properties of what is selected, in collapsible sections, searchable, with
 * advanced fields behind a per-section switch. The rows come from the field catalogue
 * (`inspector/fields.ts`); this component only lays them out and turns an edit into one op.
 */
export function Inspector({ composition, items, onChange }: InspectorProps) {
  const [query, setQuery] = useState("");
  const [advanced, setAdvanced] = useState<Partial<Record<SectionId, boolean>>>({});
  const [collapsed, setCollapsed] = useState<Partial<Record<SectionId, boolean>>>({});
  const sections = useMemo(
    () => buildInspector(items, { query, showAdvanced: advanced }),
    [items, query, advanced],
  );
  const searching = query.trim() !== "";

  if (items.length === 0) {
    return (
      <div aria-label="Inspector" className="p-3 text-xs text-neutral-400">
        <p className="mb-2 text-sm font-semibold text-neutral-100">{composition.name}</p>
        <p>
          {composition.width}×{composition.height} · {composition.fps.num / composition.fps.den} fps
          · {formatDuration(composition.durationUs)}
        </p>
        <p className="mt-3">Select a clip to see its properties here.</p>
      </div>
    );
  }

  const first = items[0];
  const title =
    items.length === 1
      ? (first?.asset?.name ?? first?.clip.type ?? "Clip")
      : `${String(items.length)} clips selected`;

  return (
    <div aria-label="Inspector" className="flex flex-col gap-2 p-3">
      <div>
        <h2
          className="truncate text-sm font-semibold text-neutral-100"
          data-testid="inspector-title"
        >
          {title}
        </h2>
        {items.length === 1 && first !== undefined && (
          <p className="text-xs text-neutral-500">{first.clip.type} clip</p>
        )}
      </div>
      <input
        type="search"
        aria-label="Search properties"
        placeholder="Search properties…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            setQuery("");
          }
        }}
        className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs text-neutral-100 outline-none focus:border-sky-500"
      />
      {sections.length === 0 && (
        <p className="text-xs text-neutral-500">
          {searching
            ? `No property matches “${query.trim()}”.`
            : "Nothing to edit for this selection."}
        </p>
      )}
      {sections.map((section) => (
        <Section
          key={section.id}
          id={section.id}
          title={section.title}
          open={collapsed[section.id] !== true}
          onToggle={() => {
            setCollapsed((c) => ({ ...c, [section.id]: c[section.id] !== true }));
          }}
          hasAdvanced={section.hasAdvanced}
          hiddenAdvanced={section.hiddenAdvanced}
          advanced={advanced[section.id] === true}
          onToggleAdvanced={() => {
            setAdvanced((a) => ({ ...a, [section.id]: a[section.id] !== true }));
          }}
          searching={searching}
        >
          {section.fields.map((field) => (
            <FieldRow
              key={field.def.id}
              field={field}
              onChange={(stored: FieldValue, source) => {
                const op = opForField(field.def, stored, items);
                if (op !== null)
                  onChange(
                    op,
                    source === "scrub" || source === "step"
                      ? `inspector:${field.def.id}`
                      : undefined,
                  );
              }}
            />
          ))}
        </Section>
      ))}
    </div>
  );
}
