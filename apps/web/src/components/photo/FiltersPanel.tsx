import type { Clip, Composition, Op } from "@lumacut/schema";
import { useMemo, useRef, useState } from "react";
import { allItems, searchItems, type BrowserItem } from "../../browser/items.ts";
import {
  effectAppliesToClip,
  filterLayerClip,
  filterLayerOps,
  type FilterContent,
} from "../../editor/filter-layers.ts";
import { addEffectOps } from "../../inspector/effect-ops.ts";
import { filterLayers, layerEffects, type AppliedFilter } from "../../photo/filters.ts";
import { Icon } from "../Icon.tsx";
import { AppliedFilters } from "./AppliedFilters.tsx";
import { FilterCard } from "./FilterCard.tsx";

interface FiltersPanelProps {
  composition: Composition;
  /** The selected, unlocked picture layers' clips (new filter layers go above them). */
  targets: readonly Clip[];
  /** How long a photo's single frame lasts (a look layer's length). */
  frameUs: number;
  run: (id: string, args?: unknown) => Promise<string | null>;
  /** Show these ops on a copy of the photo without saving them; null ends the preview. */
  onPreview: (ops: Op[] | null) => void;
  /** Select a layer's clip (to edit a look's layer, or the layer an effect is on). */
  onSelect: (clipId: string) => void;
}

const HOVER_MS = 150;
const GRID = "grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2";
const HEADING = "mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-400";
const ITEMS = allItems().filter((i) => i.kind === "look" || i.kind === "effect");
const idOf = (item: BrowserItem) => item.key.slice(item.key.indexOf(":") + 1);
let previewIds = 0;
const previewId = () => {
  previewIds += 1;
  return `preview-${String(previewIds)}`;
};

/**
 * Filters for a photo: what is applied (every filter layer, and the selected layer's own effects,
 * with on / off and remove), then looks and effects as picture cards. Hover a card to see it on the
 * photo, click to add it: each filter is added as its own layer above the selected one (keying and
 * shape effects go onto the selected layer itself).
 */
export function FiltersPanel({
  composition,
  targets,
  frameUs,
  run,
  onPreview,
  onSelect,
}: FiltersPanelProps) {
  const [query, setQuery] = useState("");
  const hover = useRef<ReturnType<typeof setTimeout> | null>(null);
  const layers = useMemo(() => filterLayers(composition), [composition]);
  const own = useMemo(() => {
    const filterClips = new Set(
      composition.tracks.flatMap((t) => {
        const clip = filterLayerClip(t);
        return clip === undefined ? [] : [clip.id];
      }),
    );
    return layerEffects(targets.filter((c) => !filterClips.has(c.id)));
  }, [composition, targets]);
  const applied: AppliedFilter[] = [...layers, ...own];
  const appliedLook = new Map(
    layers.flatMap((f) => (f.kind === "look" ? [[f.lookId, f] as const] : [])),
  );
  const appliedEffect = new Map(
    applied.flatMap((f) => (f.kind === "effect" ? [[f.effectId, f] as const] : [])),
  );
  const hasSelection = targets.length > 0;
  const selectedClipIds = useMemo(() => targets.map((c) => c.id), [targets]);

  const shown = useMemo(() => searchItems(ITEMS, query), [query]);
  const shownLooks = shown.filter((i) => i.kind === "look");
  const effectGroups = useMemo(() => {
    const map = new Map<string, BrowserItem[]>();
    for (const item of shown) {
      if (item.kind !== "effect") continue;
      map.set(item.category, [...(map.get(item.category) ?? []), item]);
    }
    return [...map.entries()];
  }, [shown]);
  const byKey = useMemo(() => new Map(ITEMS.map((i) => [i.key, i])), []);

  const endPreview = () => {
    if (hover.current !== null) clearTimeout(hover.current);
    hover.current = null;
    onPreview(null);
  };
  const startPreview = (item: BrowserItem) => {
    if (hover.current !== null) clearTimeout(hover.current);
    hover.current = setTimeout(() => {
      const id = idOf(item);
      if (item.kind === "effect" && effectAppliesToClip(id)) {
        onPreview(addEffectOps(targets, id, previewId));
        return;
      }
      const filter: FilterContent = item.kind === "look" ? { lookId: id } : { effectId: id };
      onPreview(
        filterLayerOps(
          composition,
          filter,
          { photo: true, selectedClipIds, playheadUs: 0, defaultUs: frameUs },
          { clipId: previewId(), trackId: previewId(), effectId: previewId() },
        ),
      );
    }, HOVER_MS);
  };

  const remove = (f: AppliedFilter) => {
    endPreview();
    const trackId = f.trackId;
    if (trackId !== undefined) void run("layer.delete", { trackId });
    else if (f.kind === "effect") void run("effect.remove", { effect: f.effectId });
  };
  const toggle = (f: AppliedFilter) => {
    const trackId = f.trackId;
    if (trackId !== undefined) void run("layer.toggleHidden", { trackId });
    else if (f.kind === "effect") void run("effect.toggle", { effect: f.effectId });
  };

  const lookCard = (item: BrowserItem) => {
    const on = appliedLook.get(idOf(item));
    return (
      <FilterCard
        key={item.key}
        item={item}
        available
        applied={on !== undefined}
        onHover={(inside) => {
          if (inside) startPreview(item);
          else endPreview();
        }}
        onAdd={() => {
          endPreview();
          if (on !== undefined) onSelect(on.clipId);
          else void run("color.applyLut", { look: idOf(item) });
        }}
        onRemove={() => {
          if (on !== undefined) remove(on);
        }}
      />
    );
  };
  const effectCard = (item: BrowserItem) => {
    const on = appliedEffect.get(idOf(item));
    const available = hasSelection || !effectAppliesToClip(idOf(item));
    return (
      <FilterCard
        key={item.key}
        item={item}
        available={available}
        applied={on !== undefined}
        onHover={(inside) => {
          if (inside && available) startPreview(item);
          else endPreview();
        }}
        onAdd={() => {
          endPreview();
          if (on?.trackId !== undefined) onSelect(on.clipId);
          else if (on === undefined) void run("effect.add", { effect: idOf(item) });
        }}
        onRemove={() => {
          if (on !== undefined) remove(on);
        }}
      />
    );
  };

  return (
    <section
      aria-label="Filters"
      className="flex flex-col gap-4 p-3 text-xs"
      onMouseLeave={endPreview}
    >
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Icon
            name="search"
            className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-500"
          />
          <input
            type="search"
            aria-label="Search filters"
            placeholder="Search looks and effects…"
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
            className="h-8 w-full rounded-md border border-neutral-700 bg-neutral-950 pl-7 pr-2 text-neutral-100 outline-none focus:border-sky-500"
          />
        </div>
        <button
          type="button"
          title="Add a flat colour layer (a base for gradients, noise and tints)"
          onMouseDown={(e) => {
            e.preventDefault();
          }}
          onClick={() => void run("layer.addSolid")}
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-neutral-700 px-2 text-neutral-200 hover:bg-neutral-800"
        >
          <Icon name="plus" className="h-3.5 w-3.5" /> Colour layer
        </button>
      </div>

      <AppliedFilters
        filters={applied}
        itemFor={(f) => byKey.get(f.kind === "look" ? `look:${f.lookId}` : `effect:${f.effectId}`)}
        onToggle={toggle}
        onRemove={remove}
        onRemoveAll={() => {
          endPreview();
          void run("filters.removeAll");
        }}
        onSelect={(f) => {
          onSelect(f.clipId);
        }}
      />

      {shownLooks.length > 0 && (
        <div>
          <h3 className={HEADING}>
            Looks <span className="font-normal text-neutral-600">{shownLooks.length}</span>
          </h3>
          <p className="mb-2 text-neutral-500">
            Each look is added as its own layer above the selected one. Lower its opacity to soften
            it.
          </p>
          <ul className={GRID}>{shownLooks.map(lookCard)}</ul>
        </div>
      )}

      {effectGroups.length > 0 && (
        <div className="flex flex-col gap-3">
          <div>
            <h3 className={HEADING}>Effects</h3>
            <p className="text-neutral-500">
              Each effect is added as its own layer above the selected one; adjust it in Properties.
              Keying, shadow, glow, outline and fill effects go onto the selected layer itself.
            </p>
          </div>
          {effectGroups.map(([category, list]) => (
            <div key={category}>
              <h4 className="mb-1.5 text-[11px] font-medium text-neutral-500">
                {category} <span className="text-neutral-600">{list.length}</span>
              </h4>
              <ul className={GRID}>{list.map(effectCard)}</ul>
            </div>
          ))}
        </div>
      )}

      {shownLooks.length === 0 && effectGroups.length === 0 && (
        <p className="text-neutral-500">Nothing matches “{query}”.</p>
      )}
    </section>
  );
}
