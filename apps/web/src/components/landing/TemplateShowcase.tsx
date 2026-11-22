import { CATEGORY_LABEL, type TemplateCategory } from "@lumacut/templates";
import { AnimatePresence, m, useInView } from "motion/react";
import { useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { Icon } from "../Icon.tsx";
import { DEMO } from "./demo.ts";
import { galleryItems, Thumbnail } from "../templates/TemplateGallery.tsx";
import { COUNTS } from "./content.ts";
import { Heading, SECTION } from "./Heading.tsx";
import { EXIT, RISE_AT, Reveal } from "./motion.tsx";

const ALL = galleryItems([]);
const CATEGORIES = Object.keys(CATEGORY_LABEL) as TemplateCategory[];
const CARD_HEIGHT = 240;

/** The built-in templates, drawn live by the engine, in a row you can scroll sideways. */
export function TemplateShowcase() {
  const [category, setCategory] = useState<TemplateCategory | "all">("all");
  const shown = useMemo(
    () => ALL.filter((t) => category === "all" || t.category === category),
    [category],
  );
  const listRef = useRef<HTMLUListElement>(null);
  const seen = useInView(listRef, { once: true, amount: 0.15 });
  return (
    <section id="templates" className={SECTION}>
      <Heading
        eyebrow="Templates"
        title={`${String(COUNTS.templates)} templates to start from`}
        text="Drop your photos, clips and words into a finished design. Every animation stays editable."
      />
      <Reveal>
        <div
          role="tablist"
          aria-label="Template categories"
          className="mb-6 flex flex-wrap justify-center gap-2"
        >
          {(["all", ...CATEGORIES] as const).map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={category === c}
              onClick={() => {
                setCategory(c);
              }}
              className={`h-9 rounded-full px-4 text-sm font-medium transition ${
                category === c
                  ? "bg-sky-600 text-white"
                  : "border border-neutral-800 bg-neutral-900 text-neutral-300 hover:bg-neutral-800"
              }`}
            >
              {c === "all" ? "All" : CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
      </Reveal>
      <m.ul ref={listRef} className="flex snap-x gap-4 overflow-x-auto pb-4">
        <AnimatePresence mode="popLayout">
          {shown.map((item, index) => {
            const [w = 16, h = 9] = item.aspect.split(":").map(Number);
            return (
              <m.li
                key={item.key}
                layout
                variants={RISE_AT}
                custom={index}
                initial="hidden"
                animate={seen ? "shown" : "hidden"}
                exit={EXIT}
                className="group shrink-0 snap-start"
              >
                <Link
                  to="/register"
                  aria-label={`Start with the “${item.name}” template`}
                  className="relative block overflow-hidden rounded-xl border border-neutral-800 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-500 hover:shadow-lg"
                  style={{ height: CARD_HEIGHT, width: (CARD_HEIGHT * w) / h }}
                >
                  <Thumbnail item={item} variant={DEMO} />
                  <span className="absolute inset-0 grid place-items-center bg-black/55 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white">
                      Use template <Icon name="arrowRight" className="h-3.5 w-3.5" />
                    </span>
                  </span>
                </Link>
                <p className="mt-2 text-sm font-medium text-neutral-100">{item.name}</p>
                <p className="text-xs text-neutral-500">
                  {item.category === "mine" ? "" : CATEGORY_LABEL[item.category]} · {item.aspect}
                </p>
              </m.li>
            );
          })}
        </AnimatePresence>
      </m.ul>
    </section>
  );
}
