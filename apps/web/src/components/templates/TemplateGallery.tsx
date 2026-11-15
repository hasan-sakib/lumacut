import type { Project } from "@lumacut/schema";
import {
  CATEGORY_LABEL,
  TEMPLATES,
  type TemplateAspect,
  type TemplateCategory,
} from "@lumacut/templates";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SavedTemplate } from "../../api/templates.ts";
import { projectThumbnail, templateThumbnail } from "../../templates/thumbnails.ts";

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

/** A different drawing of a template: its own cache key, a change to the project, and a moment. */
export interface ThumbnailVariant {
  key: string;
  prepare: (project: Project) => Project;
  /** When to draw, as a fraction of the template's length (0..1). */
  at: number;
}

/**
 * A template's picture, drawn by the engine when the card scrolls into view. With `variant` (keep
 * it a module constant), the project is changed first and drawn at another moment.
 */
export function Thumbnail({ item, variant }: { item: GalleryItem; variant?: ThumbnailVariant }) {
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
        if (variant !== undefined) project = variant.prepare(project);
      } catch {
        setFailed(true);
        return;
      }
      const drawn = project;
      const main = drawn.compositions.find((c) => c.id === drawn.mainCompositionId);
      const pending =
        variant === undefined
          ? templateThumbnail(item.key, drawn)
          : projectThumbnail(
              `${variant.key}:${item.key}`,
              () => drawn,
              480,
              Math.round((main?.durationUs ?? 0) * variant.at),
            );
      pending.then(
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
  }, [item, variant]);
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
  /** Search words from outside (the page's search box); hides the gallery's own search field. */
  query?: string;
  /** Show only the first few cards, without the filter row (the Home preview). */
  limit?: number;
}

/** Every template, by category and shape, searchable, each drawn live by the engine. */
export function TemplateGallery({
  saved,
  onUse,
  onDelete,
  busy,
  query: outerQuery,
  limit,
}: TemplateGalleryProps) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("all");
  const [aspect, setAspect] = useState<(typeof ASPECTS)[number]>("all");
  const [ownQuery, setQuery] = useState("");
  const query = outerQuery ?? ownQuery;
  const items = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const all = galleryItems(saved).filter((i) => {
      if (tab !== "all" && i.category !== tab) return false;
      if (aspect !== "all" && i.aspect !== aspect) return false;
      const hay = [i.name, i.description, i.category, ...i.keywords].join(" ").toLowerCase();
      return words.every((w) => hay.includes(w));
    });
    return limit === undefined ? all : all.slice(0, limit);
  }, [saved, tab, aspect, query, limit]);
  return (
    <section aria-label="Templates" className="flex flex-col gap-3">
      <div className={limit === undefined ? "flex flex-wrap items-center gap-2 text-xs" : "hidden"}>
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
              className={`h-8 rounded-full px-3.5 font-medium transition ${tab === t ? "bg-sky-600 text-white" : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"}`}
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
          className="ml-auto h-8 rounded-lg border border-neutral-800 bg-neutral-900 px-2 text-neutral-200 outline-none focus:border-sky-500"
        >
          {ASPECTS.map((a) => (
            <option key={a} value={a}>
              {a === "all" ? "Any shape" : a}
            </option>
          ))}
        </select>
        <input
          type="search"
          hidden={outerQuery !== undefined}
          aria-label="Search templates"
          placeholder="Search templates…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
          }}
          className="h-8 min-w-40 flex-1 rounded-lg border border-neutral-800 bg-neutral-900 px-2.5 text-neutral-100 outline-none focus:border-sky-500"
        />
      </div>
      {items.length === 0 && <p className="text-xs text-neutral-500">No template matches.</p>}
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] items-end gap-4">
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
              className="overflow-hidden rounded-lg border border-neutral-800 shadow-sm ring-sky-500 transition hover:-translate-y-0.5 hover:shadow-md hover:ring-2 focus-visible:ring-2 disabled:opacity-50"
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
