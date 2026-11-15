import type { BrowserItem } from "../../browser/items.ts";
import { Picture } from "../browser/ItemCard.tsx";
import { Icon } from "../Icon.tsx";
import { Tip } from "../Tip.tsx";

interface FilterCardProps {
  item: BrowserItem;
  /** It can be added now (a fitting layer is selected). */
  available: boolean;
  /** Already on the picture / the selected layer. */
  applied: boolean;
  onAdd: () => void;
  onRemove: () => void;
  onHover: (inside: boolean) => void;
}

/** A look or an effect as a picture card: click adds it; ✓ and ✕ when it is already applied. */
export function FilterCard({
  item,
  available,
  applied,
  onAdd,
  onRemove,
  onHover,
}: FilterCardProps) {
  const disabled = !available && !applied;
  return (
    <li
      data-testid="filter-card"
      data-item={item.key}
      data-applied={applied}
      className={`group relative overflow-hidden rounded-lg border bg-neutral-900 transition ${
        applied
          ? "border-sky-500 ring-1 ring-sky-500/40"
          : disabled
            ? "border-neutral-800/60 opacity-60"
            : "border-neutral-800 hover:border-sky-500"
      }`}
    >
      <Tip
        title={item.name}
        description={
          applied
            ? `${item.description} Applied. Use ✕ to remove it.`
            : `${item.description}${available ? "" : " Select a layer first."}`
        }
      >
        <button
          type="button"
          disabled={disabled}
          aria-label={applied ? `${item.name} (applied)` : `Add ${item.name}`}
          onMouseDown={(e) => {
            e.preventDefault();
          }}
          onMouseEnter={() => {
            if (!applied) onHover(true);
          }}
          onMouseLeave={() => {
            onHover(false);
          }}
          onClick={onAdd}
          className="block w-full text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sky-400 disabled:cursor-not-allowed"
        >
          <Picture item={item} />
          <span className="line-clamp-2 block min-h-[2.4em] px-1.5 py-1 text-[11px] font-medium leading-tight text-neutral-200">
            {item.name}
          </span>
        </button>
      </Tip>
      {applied && (
        <>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-sky-500 text-white shadow"
          >
            <Icon name="check" className="h-3 w-3" />
          </span>
          <button
            type="button"
            title={`Remove ${item.name}`}
            aria-label={`Remove ${item.name}`}
            onClick={onRemove}
            className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/70 text-white shadow hover:bg-red-600 focus-visible:outline-2 focus-visible:outline-sky-400"
          >
            <Icon name="cancel" className="h-3 w-3" />
          </button>
        </>
      )}
    </li>
  );
}
