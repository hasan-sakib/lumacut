import { useEffect, useState } from "react";
import type { BrowserItem } from "../../browser/items.ts";
import { itemThumbnail, itemTile } from "../../browser/thumbnails.ts";
import { Icon } from "../Icon.tsx";
import { useInView } from "../library/useRemoteJson.ts";
import { Tip } from "../Tip.tsx";

interface ItemCardProps {
  item: BrowserItem;
  available: boolean;
  starred: boolean;
  onApply: () => void;
  onHover: (inside: boolean) => void;
  onToggleFavourite: () => void;
}

/** The card's picture: the engine's drawing of the item, or its icon tile. */
function Picture({ item }: { item: BrowserItem }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const tile = itemTile(item);
  useEffect(() => {
    if (!inView) return;
    const pending = itemThumbnail(item);
    if (pending === null) return;
    let active = true;
    pending.then(
      (u) => {
        if (active) setUrl(u);
      },
      // Couldn't be drawn: the icon tile stays.
      () => {
        if (active) setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [inView, item]);
  return (
    <div
      ref={ref}
      data-picture={url !== null ? "drawn" : failed ? "failed" : "icon"}
      className={`grid aspect-video w-full place-items-center overflow-hidden ${url === null ? tile.tint : "bg-black"}`}
    >
      {url === null ? (
        <Icon name={tile.icon} className="h-6 w-6" />
      ) : (
        <img src={url} alt="" draggable={false} className="h-full w-full object-cover" />
      )}
    </div>
  );
}

/** One effect, transition, preset, look or audio effect as a small card: picture, name, ☆. */
export function ItemCard({
  item,
  available,
  starred,
  onApply,
  onHover,
  onToggleFavourite,
}: ItemCardProps) {
  return (
    <li
      data-testid="browser-item"
      data-item={item.key}
      className={`group relative overflow-hidden rounded-lg border bg-neutral-900 transition ${
        available ? "border-neutral-800 hover:border-sky-500" : "border-neutral-800/60 opacity-45"
      }`}
    >
      <Tip
        title={item.name}
        description={`${item.description}${available ? "" : " Select a fitting clip first."}`}
      >
        <button
          type="button"
          disabled={!available}
          aria-label={`Apply ${item.name}`}
          onMouseDown={(e) => {
            e.preventDefault();
          }}
          onMouseEnter={() => {
            onHover(true);
          }}
          onMouseLeave={() => {
            onHover(false);
          }}
          onClick={onApply}
          className="block w-full text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sky-400 disabled:cursor-not-allowed"
        >
          <Picture item={item} />
          <span className="line-clamp-2 block min-h-[2.4em] px-1.5 py-1 text-[11px] font-medium leading-tight text-neutral-200">
            {item.name}
          </span>
        </button>
      </Tip>
      <button
        type="button"
        title={starred ? `Remove ${item.name} from favourites` : `Add ${item.name} to favourites`}
        aria-label={starred ? `Unfavourite ${item.name}` : `Favourite ${item.name}`}
        aria-pressed={starred}
        onClick={onToggleFavourite}
        className={`absolute right-1 top-1 grid h-5 w-5 place-items-center rounded bg-black/55 transition focus-visible:opacity-100 ${
          starred
            ? "text-amber-400"
            : "text-white opacity-0 hover:text-amber-300 group-hover:opacity-100"
        }`}
      >
        <svg viewBox="0 0 24 24" className="h-3 w-3" aria-hidden="true">
          <path
            d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.9 6.6 19.8l1.1-6.1L3.2 9.4l6.1-.8z"
            fill={starred ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth={2}
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </li>
  );
}
