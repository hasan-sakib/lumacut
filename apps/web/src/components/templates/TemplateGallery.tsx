import type { Project } from "@lumacut/schema";
import {
  CATEGORY_LABEL,
  TEMPLATES,
  type TemplateAspect,
  type TemplateCategory,
} from "@lumacut/templates";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SavedTemplate } from "../../api/templates.ts";
import { templateThumbnail } from "../../templates/thumbnails.ts";

/** One card in the gallery: a built-in template or one you saved. */
export interface GalleryItem {
  key: string;
  name: string;
  description: string;
  category: TemplateCategory | "mine";
  aspect: string;
  keywords: readonly string[];
  build: () => Project;
}

export function galleryItems(saved: readonly SavedTemplate[]): GalleryItem[] {
  const builtIn: GalleryItem[] = TEMPLATES.map((t) => ({
    key: t.id,
    name: t.name,
    description: t.description,
    category: t.category,
    aspect: t.aspect,
    keywords: t.keywords,
    build: t.build,
  }));
  const mine: GalleryItem[] = saved.map((t) => ({
    key: `saved:${t.id}`,
    name: t.name,
    description: t.description,
    category: "mine",
    aspect: t.aspect,
    keywords: [],
    build: () => t.doc as unknown as Project,
  }));
  return [...mine, ...builtIn];
}

const ASPECTS: (TemplateAspect | "all")[] = ["all", "9:16", "16:9", "1:1", "4:5"];
const TABS: (TemplateCategory | "mine" | "all")[] = [
  "all",
  "reels",
  "intros",
  "lowerThirds",
  "slideshows",
  "quoteCards",
  "mine",
];

function Thumbnail({ item }: { item: GalleryItem }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    let cancelled = false;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      observer.disconnect();
      let project: Project;
      try {
        project = item.build();
      } catch {
        setFailed(true);
        return;
      }
      templateThumbnail(item.key, project).then(
        (u) => {
          if (!cancelled) setUrl(u);
        },
        () => {
          if (!cancelled) setFailed(true);
        },
      );
    });
    observer.observe(el);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [item]);
  const [w, h] = item.aspect.split(":").map(Number);
  return (
    <div
      ref={ref}
      className="relative w-full overflow-hidden rounded-md bg-neutral-800"
      style={{ aspectRatio: `${String(w ?? 16)} / ${String(h ?? 9)}` }}
    >
      {url !== null && <img src={url} alt="" className="h-full w-full object-cover" />}
      {url === null && (
        <span className="absolute inset-0 grid place-items-center text-[10px] text-neutral-500">
          {failed ? "No preview" : "…"}
        </span>
      )}
    </div>
  );
}

interface TemplateGalleryProps {
  saved: readonly SavedTemplate[];
  /** Start a project from this card. */
  onUse: (item: GalleryItem) => void;
  /** Remove one of your own templates. */
  onDelete?: (item: GalleryItem) => void;
  busy?: string | null;
}

/** Every template, by category and shape, searchable, each drawn live by the engine. */
export function TemplateGallery({ saved, onUse, onDelete, busy }: TemplateGalleryProps) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("all");
  const [aspect, setAspect] = useState<(typeof ASPECTS)[number]>("all");
  const [query, setQuery] = useState("");
  const items = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return galleryItems(saved).filter((i) => {
      if (tab !== "all" && i.category !== tab) return false;
      if (aspect !== "all" && i.aspect !== aspect) return false;
      const hay = [i.name, i.description, i.category, ...i.keywords].join(" ").toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [saved, tab, aspect, query]);
  return (
    <section aria-label="Templates" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <div role="tablist" aria-label="Template categories" className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => {
                setTab(t);
              }}
              className={`rounded-full px-3 py-1 ${tab === t ? "bg-sky-600 text-white" : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"}`}
            >
              {t === "all" ? "All" : t === "mine" ? "Mine" : CATEGORY_LABEL[t]}
            </button>
          ))}
        </div>
        <select
          aria-label="Shape"
          value={aspect}
          onChange={(e) => {
            setAspect(e.target.value as (typeof ASPECTS)[number]);
          }}
          className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-neutral-200"
        >
          {ASPECTS.map((a) => (
            <option key={a} value={a}>
              {a === "all" ? "Any shape" : a}
            </option>
          ))}
        </select>
        <input
          type="search"
          aria-label="Search templates"
          placeholder="Search templates…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
          }}
          className="min-w-40 flex-1 rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-neutral-100"
        />
      </div>
      {items.length === 0 && <p className="text-xs text-neutral-500">No template matches.</p>}
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3">
        {items.map((item) => (
          <li key={item.key} data-testid="template-card" className="flex flex-col gap-1">
            <button
              type="button"
              title={`${item.name}: ${item.description}`}
              aria-label={`Use the “${item.name}” template`}
              disabled={busy !== null && busy !== undefined}
              onClick={() => {
                onUse(item);
              }}
              className="rounded-md ring-sky-500 hover:ring-2 focus-visible:ring-2 disabled:opacity-50"
            >
              <Thumbnail item={item} />
            </button>
            <div className="flex items-start gap-1">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-neutral-100">
                  {busy === item.key ? "Creating…" : item.name}
                </p>
                <p className="text-[10px] text-neutral-500">{item.aspect}</p>
              </div>
              {item.category === "mine" && onDelete !== undefined && (
                <button
                  type="button"
                  title="Remove this template (projects made from it stay)"
                  aria-label={`Remove the “${item.name}” template`}
                  onClick={() => {
                    onDelete(item);
                  }}
                  className="rounded px-1 text-[10px] text-neutral-400 hover:bg-neutral-800"
                >
                  Remove
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
