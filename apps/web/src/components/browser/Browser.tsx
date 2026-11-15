import { useMemo, useRef, useState } from "react";
import {
  KIND_LABEL,
  allItems,
  searchItems,
  type BrowserItem,
  type BrowserKind,
} from "../../browser/items.ts";
import { usePrefsStore } from "../../stores/prefs.ts";

interface BrowserProps {
  /** Which kinds to show (templates live on the start screen). */
  kinds: readonly BrowserKind[];
  /** Is the item's action available right now (a fitting clip is selected)? */
  canApply: (item: BrowserItem) => boolean;
  /** Apply for real (one undo step). */
  onApply: (item: BrowserItem) => void;
  /** Show it on the selected clip without committing; null ends the preview. */
  onPreview: (item: BrowserItem | null) => void;
}

const HOVER_MS = 150;

/**
 * Effects, transitions, audio effects, motion presets and looks in one searchable browser, with
 * favourites (☆) and recents, and a live preview on the selected clip while you hover an item.
 */
export function Browser({ kinds, canApply, onApply, onPreview }: BrowserProps) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<BrowserKind | "all">("all");
  const favourites = usePrefsStore((s) => s.favourites);
  const recents = usePrefsStore((s) => s.recents);
  const toggleFavourite = usePrefsStore((s) => s.toggleFavourite);
  const noteUse = usePrefsStore((s) => s.noteUse);
  const hover = useRef<ReturnType<typeof setTimeout> | null>(null);
  const items = useMemo(() => allItems().filter((i) => kinds.includes(i.kind)), [kinds]);
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

  const row = (item: BrowserItem, where: string) => {
    const available = canApply(item);
    const starred = favourites.includes(item.key);
    return (
      <li key={`${where}:${item.key}`} className="flex items-center gap-1">
        <button
          type="button"
          disabled={!available}
          title={`${item.name}: ${item.description}${available ? "" : " (select a fitting clip first)"}`}
          aria-label={`Apply ${item.name}`}
          onMouseDown={(e) => {
            e.preventDefault();
          }}
          onMouseEnter={() => {
            if (!available || !item.previewable) return;
            if (hover.current !== null) clearTimeout(hover.current);
            hover.current = setTimeout(() => {
              onPreview(item);
            }, HOVER_MS);
          }}
          onMouseLeave={endPreview}
          onClick={() => {
            endPreview();
            noteUse(item.key);
            onApply(item);
          }}
          className="min-w-0 flex-1 truncate rounded px-2 py-1 text-left text-neutral-200 hover:bg-neutral-800 disabled:opacity-40"
        >
          {item.name}
        </button>
        <button
          type="button"
          title={starred ? `Remove ${item.name} from favourites` : `Add ${item.name} to favourites`}
          aria-label={starred ? `Unfavourite ${item.name}` : `Favourite ${item.name}`}
          aria-pressed={starred}
          onClick={() => {
            toggleFavourite(item.key);
          }}
          className={`rounded px-1 ${starred ? "text-amber-400" : "text-neutral-600 hover:text-neutral-300"}`}
        >
          {starred ? "★" : "☆"}
        </button>
      </li>
    );
  };

  return (
    <section
      aria-label="Browser"
      className="flex flex-col gap-2 p-3 text-xs"
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
        className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-neutral-100"
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
            className={`rounded-full px-2 py-0.5 ${kind === k ? "bg-sky-600 text-white" : "bg-neutral-800 text-neutral-300"}`}
          >
            {k === "all" ? "All" : KIND_LABEL[k]}
          </button>
        ))}
      </div>
      <p className="text-neutral-500">Hover to preview on the selected clip, click to apply.</p>
      {query === "" && favouriteItems.length > 0 && (
        <div>
          <h3 className="mb-1 font-semibold text-neutral-300">★ Favourites</h3>
          <ul>{favouriteItems.map((i) => row(i, "fav"))}</ul>
        </div>
      )}
      {query === "" && recentItems.length > 0 && (
        <div>
          <h3 className="mb-1 font-semibold text-neutral-300">Recent</h3>
          <ul>{recentItems.map((i) => row(i, "recent"))}</ul>
        </div>
      )}
      {groups.length === 0 && <p className="text-neutral-500">Nothing matches “{query}”.</p>}
      {groups.map(([title, list]) => (
        <div key={title}>
          <h3 className="mb-1 font-semibold text-neutral-300">{title}</h3>
          <ul>{list.map((i) => row(i, "all"))}</ul>
        </div>
      ))}
    </section>
  );
}
