import type { Composition, Op, Project } from "@lumacut/schema";
import { useMemo, useState } from "react";
import type { ClipInfo, FieldValue, SectionId } from "../../inspector/fields.ts";
import { toggleKeyframeOp } from "../../inspector/animation.ts";
import { buildInspector, opForField } from "../../inspector/selection.ts";
import { formatDuration } from "../../lib/format.ts";
import { ColorExtras } from "../color/ColorExtras.tsx";
import { EffectsInspector } from "../effects/EffectsInspector.tsx";
import { TransitionInspector } from "../effects/TransitionInspector.tsx";
import { MasksInspector } from "../masks/MasksInspector.tsx";
import { MatteInspector } from "../masks/MatteInspector.tsx";
import { ShapeInspector } from "../shapes/ShapeInspector.tsx";
import { CaptionEditor } from "../text/CaptionEditor.tsx";
import { TextInspector } from "../text/TextInspector.tsx";
import type { LutAsset } from "../color/LutPicker.tsx";
import { FieldRow } from "./FieldRow.tsx";
import { Section } from "./Section.tsx";

interface InspectorProps {
  composition: Composition;
  /** The selected clips with their track and asset. */
  items: readonly ClipInfo[];
  /** The project (names clips in lists, sizes masks); optional for callers that don't have it. */
  project?: Project;
  /** `.cube` look-up tables in the project (for the LUT picker). */
  lutAssets?: readonly LutAsset[];
  /** Where the playhead is: animated properties show their value here and ◆ acts here. */
  playheadUs: number;
  /** Apply a change; edits of the same field close together share `coalesceKey` (one undo step). */
  onChange: (op: Op, coalesceKey: string | undefined) => void;
}

/**
 * Shows only the properties of what is selected, in collapsible sections, searchable, with
 * advanced fields behind a per-section switch. The rows come from the field catalogue
 * (`inspector/fields.ts`); this component only lays them out and turns an edit into one op.
 */
export function Inspector({
  composition,
  items,
  playheadUs,
  lutAssets = [],
  project,
  onChange,
}: InspectorProps) {
  const [query, setQuery] = useState("");
  const [advanced, setAdvanced] = useState<Partial<Record<SectionId, boolean>>>({});
  const [collapsed, setCollapsed] = useState<Partial<Record<SectionId, boolean>>>({});
  const sections = useMemo(
    () => buildInspector(items, { query, showAdvanced: advanced, playheadUs }),
    [items, query, advanced, playheadUs],
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
  // Look-up table, HSL ranges and curves: for one picture clip, shown unless a search excludes them.
  const showColorExtras =
    items.length === 1 &&
    first?.track?.kind !== "audio" &&
    (!searching || /colou?r|curve|lut|look|hsl|hue|grade/i.test(query));
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
                const op = opForField(field.def, stored, items, playheadUs);
                if (op !== null)
                  onChange(
                    op,
                    source === "scrub" || source === "step"
                      ? `inspector:${field.def.id}`
                      : undefined,
                  );
              }}
              onToggleKey={() => {
                const op = toggleKeyframeOp(field.def, items, playheadUs);
                if (op !== null) onChange(op, undefined);
              }}
            />
          ))}
        </Section>
      ))}
      {showColorExtras && first !== undefined && (
        <ColorExtras clip={first.clip} lutAssets={lutAssets} onChange={onChange} />
      )}
      {showColorExtras && first !== undefined && (
        <EffectsInspector item={first} playheadUs={playheadUs} onChange={onChange} />
      )}
      {showColorExtras && first !== undefined && (
        <TransitionInspector item={first} playheadUs={playheadUs} onChange={onChange} />
      )}
      {items.length === 1 &&
        first !== undefined &&
        (first.clip.type === "text" || first.clip.type === "caption") && (
          <TextInspector
            clip={first.clip}
            item={first}
            playheadUs={playheadUs}
            onChange={onChange}
          />
        )}
      {showColorExtras && first !== undefined && (
        <MasksInspector
          item={first}
          project={project}
          composition={composition}
          playheadUs={playheadUs}
          onChange={onChange}
        />
      )}
      {showColorExtras && first !== undefined && (
        <MatteInspector
          item={first}
          project={project}
          composition={composition}
          onChange={onChange}
        />
      )}
      {items.length === 1 && first?.clip.type === "shape" && (
        <ShapeInspector item={first} playheadUs={playheadUs} onChange={onChange} />
      )}
      {items.length === 1 && first?.clip.type === "caption" && (
        <CaptionEditor
          clip={first.clip}
          compositionHeight={composition.height}
          onChange={onChange}
        />
      )}
    </div>
  );
}
