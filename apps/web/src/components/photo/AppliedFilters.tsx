import type { BrowserItem } from "../../browser/items.ts";
import type { AppliedFilter } from "../../photo/filters.ts";
import { Picture } from "../browser/ItemCard.tsx";
import { Icon } from "../Icon.tsx";

interface AppliedFiltersProps {
  filters: readonly AppliedFilter[];
  /** The card item for a look or effect id (for its picture). */
  itemFor: (filter: AppliedFilter) => BrowserItem | undefined;
  onToggle: (filter: AppliedFilter) => void;
  onRemove: (filter: AppliedFilter) => void;
  onRemoveAll: () => void;
  onSelect: (filter: AppliedFilter) => void;
}

/** What is on the picture now: each look layer and each effect of the selected layer. */
export function AppliedFilters({
  filters,
  itemFor,
  onToggle,
  onRemove,
  onRemoveAll,
  onSelect,
}: AppliedFiltersProps) {
  if (filters.length === 0) return null;
  return (
    <section aria-label="Applied filters" className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <h3 className="flex-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
          Applied <span className="font-normal text-neutral-600">{filters.length}</span>
        </h3>
        {filters.length > 1 && (
          <button
            type="button"
            data-action="filters.removeAll"
            onClick={onRemoveAll}
            className="rounded px-1.5 py-0.5 text-[11px] font-medium text-red-300 hover:bg-red-950"
          >
            Remove all
          </button>
        )}
      </div>
      <ul className="flex flex-col gap-1.5">
        {filters.map((f) => {
          const item = itemFor(f);
          const key = f.kind === "look" ? `look:${f.trackId}` : `fx:${f.clipId}:${f.instanceId}`;
          const locked = f.locked === true;
          return (
            <li
              key={key}
              data-testid="applied-filter"
              className={`flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-1.5 ${
                f.enabled ? "" : "opacity-60"
              }`}
            >
              <button
                type="button"
                title={f.trackId === undefined ? "Select this layer" : "Select this filter's layer"}
                aria-label={`Select ${f.name}`}
                onClick={() => {
                  onSelect(f);
                }}
                className="w-14 shrink-0 overflow-hidden rounded"
              >
                {item === undefined ? (
                  <span className="grid aspect-video place-items-center bg-neutral-800">
                    <Icon name="effect" />
                  </span>
                ) : (
                  <Picture item={item} />
                )}
              </button>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-neutral-100">
                  {f.name}
                </span>
                <span className="block text-[10px] text-neutral-500">
                  {f.kind === "look"
                    ? "Look · own layer"
                    : f.trackId === undefined
                      ? `${f.category} · on this layer`
                      : `${f.category} · own layer`}
                  {f.enabled ? "" : " · off"}
                </span>
              </span>
              <button
                type="button"
                disabled={locked}
                title={f.enabled ? `Turn ${f.name} off` : `Turn ${f.name} back on`}
                aria-label={f.enabled ? `Turn ${f.name} off` : `Turn ${f.name} on`}
                aria-pressed={f.enabled}
                onClick={() => {
                  onToggle(f);
                }}
                className="grid h-6 w-6 shrink-0 place-items-center rounded text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-40"
              >
                <Icon name={f.enabled ? "eye" : "eyeOff"} className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                disabled={locked}
                title={locked ? "Unlock the layer to remove it" : `Remove ${f.name}`}
                aria-label={`Remove ${f.name}`}
                onClick={() => {
                  onRemove(f);
                }}
                className="grid h-6 w-6 shrink-0 place-items-center rounded text-neutral-400 hover:bg-red-950 hover:text-red-300 disabled:opacity-40"
              >
                <Icon name="trash" className="h-3.5 w-3.5" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
