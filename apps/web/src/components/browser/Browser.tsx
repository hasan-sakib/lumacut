import { useMemo, useRef, useState } from "react";
import {
  KIND_LABEL,
  allItems,
  searchItems,
  withLutItems,
  type BrowserItem,
  type BrowserKind,
} from "../../browser/items.ts";
import { usePrefsStore } from "../../stores/prefs.ts";
import { ItemCard } from "./ItemCard.tsx";

interface BrowserProps {
  /** Which kinds to show (templates live on the start screen). */
  kinds: readonly BrowserKind[];
  /** Is the item's action available right now (a fitting clip is selected)? */
  canApply: (item: BrowserItem) => boolean;
  /** Apply for real (one undo step). */
  onApply: (item: BrowserItem) => void;
  /** Show it on the selected clip without committing; null ends the preview. */
  onPreview: (item: BrowserItem | null) => void;
  /** Extra items (your own LUTs), shown before the built-in looks. */
  extra?: readonly BrowserItem[];
}

const HOVER_MS = 150;
const NONE: readonly BrowserItem[] = [];
/** As many columns as fit: a wider side panel shows more cards per row. */
const GRID = "grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2";
const HEADING = "mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-400";

/**
 * Effects, transitions, audio effects, motion presets and looks in one searchable browser, with
 * favourites (☆) and recents, and a live preview on the selected clip while you hover an item.
 */
export function Browser({ kinds, canApply, onApply, onPreview, extra = NONE }: BrowserProps) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<BrowserKind | "all">("all");
  const favourites = usePrefsStore((s) => s.favourites);
  const recents = usePrefsStore((s) => s.recents);
  const toggleFavourite = usePrefsStore((s) => s.toggleFavourite);
  const noteUse = usePrefsStore((s) => s.noteUse);
  const hover = useRef<ReturnType<typeof setTimeout> | null>(null);
  const items = useMemo(
    () => withLutItems(allItems(), extra).filter((i) => kinds.includes(i.kind)),
    [kinds, extra],
  );
  const byKey = useMemo(() => new Map(items.map((i) => [i.key, i])), [items]);
  const shown = useMemo(
    () => searchItems(items, query).filter((i) => kind === "all" || i.kind === kind),
    [items, query, kind],
  );
  const pick = (keys: readonly string[]) =>
    keys.map((k) => byKey.get(k)).filter((i): i is BrowserItem => i !== undefined);
  const favouriteItems = pick(favourites);
  const recentItems = pick(recents).slice(0, 8);
  const groups = useMemo(() => {
    const map = new Map<string, BrowserItem[]>();
    for (const item of shown) {
      const title = `${KIND_LABEL[item.kind]} · ${item.category}`;
      map.set(title, [...(map.get(title) ?? []), item]);
    }
    return [...map.entries()];
  }, [shown]);

  const endPreview = () => {
    if (hover.current !== null) clearTimeout(hover.current);
    hover.current = null;
    onPreview(null);
  };

  const card = (item: BrowserItem, where: string) => {
    const available = canApply(item);
    return (
      <ItemCard
        key={`${where}:${item.key}`}
        item={item}
        available={available}
        starred={favourites.includes(item.key)}
        onHover={(inside) => {
          if (!inside) {
            endPreview();
            return;
          }
          if (!available || !item.previewable) return;
          if (hover.current !== null) clearTimeout(hover.current);
          hover.current = setTimeout(() => {
            onPreview(item);
          }, HOVER_MS);
        }}
        onApply={() => {
          endPreview();
          noteUse(item.key);
          onApply(item);
        }}
        onToggleFavourite={() => {
          toggleFavourite(item.key);
        }}
      />
    );
  };

  return (
    <section
      aria-label="Browser"
      className="flex flex-col gap-3 p-3 text-xs"
      onMouseLeave={endPreview}
    >
      <input
        type="search"
        aria-label="Search effects, transitions and presets"
        placeholder="Search effects, transitions, presets, looks…"
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
        className="h-8 rounded-md border border-neutral-700 bg-neutral-950 px-2.5 text-neutral-100 outline-none focus:border-sky-500"
      />
      <div role="tablist" aria-label="Kinds" className="flex flex-wrap gap-1">
        {(["all", ...kinds] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={kind === k}
            onClick={() => {
              setKind(k);
            }}
            className={`rounded-full px-2.5 py-1 ${kind === k ? "bg-sky-600 text-white" : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"}`}
          >
            {k === "all" ? "All" : KIND_LABEL[k]}
          </button>
        ))}
      </div>
      <p className="text-neutral-500">
        Hover to preview, click to apply. Looks and effects are added as their own layer above the
        selected clip.
      </p>
      {query === "" && favouriteItems.length > 0 && (
        <div>
          <h3 className={HEADING}>Favourites</h3>
          <ul className={GRID}>{favouriteItems.map((i) => card(i, "fav"))}</ul>
        </div>
      )}
      {query === "" && recentItems.length > 0 && (
        <div>
          <h3 className={HEADING}>Recent</h3>
          <ul className={GRID}>{recentItems.map((i) => card(i, "recent"))}</ul>
        </div>
      )}
      {groups.length === 0 && <p className="text-neutral-500">Nothing matches “{query}”.</p>}
      {groups.map(([title, list]) => (
        <div key={title}>
          <h3 className={HEADING}>
            {title} <span className="font-normal text-neutral-600">{list.length}</span>
          </h3>
          <ul className={GRID}>{list.map((i) => card(i, "all"))}</ul>
        </div>
      ))}
    </section>
  );
}
