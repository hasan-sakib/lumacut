import { useMemo, useState } from "react";
import { allItems, type BrowserKind } from "../../browser/items.ts";
import { Picture } from "../browser/ItemCard.tsx";
import { COUNTS } from "./content.ts";
import { Heading, SECTION } from "./Heading.tsx";

const KINDS: { kind: BrowserKind; label: string; count: number }[] = [
  { kind: "effect", label: "Effects", count: COUNTS.effects },
  { kind: "look", label: "Looks", count: COUNTS.looks },
  { kind: "transition", label: "Transitions", count: COUNTS.transitions },
];
const ITEMS = allItems();
const SHOWN = 12;

/** Effects, looks and transitions as live pictures: the same cards the editor shows. */
export function EffectShowcase() {
  const [kind, setKind] = useState<BrowserKind>("effect");
  const all = useMemo(() => ITEMS.filter((i) => i.kind === kind), [kind]);
  const shown = all.slice(0, SHOWN);
  return (
    <section id="effects" className={SECTION}>
      <Heading
        eyebrow="Effects"
        title="See every effect before you use it"
        text="Each card is drawn by the engine on a sample scene. In the editor, hovering one previews it on your own clip."
      />
      <div role="tablist" aria-label="Kinds" className="mb-6 flex flex-wrap justify-center gap-2">
        {KINDS.map((k) => (
          <button
            key={k.kind}
            type="button"
            role="tab"
            aria-selected={kind === k.kind}
            onClick={() => {
              setKind(k.kind);
            }}
            className={`h-9 rounded-full px-4 text-sm font-medium transition ${
              kind === k.kind
                ? "bg-sky-600 text-white"
                : "border border-neutral-800 bg-neutral-900 text-neutral-300 hover:bg-neutral-800"
            }`}
          >
            {k.label} <span className="opacity-70">{k.count}</span>
          </button>
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {shown.map((item) => (
          <li
            key={item.key}
            className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900"
          >
            <Picture item={item} />
            <p className="truncate px-2.5 py-2 text-xs font-medium text-neutral-200">{item.name}</p>
          </li>
        ))}
      </ul>
      {all.length > shown.length && (
        <p className="mt-5 text-center text-sm text-neutral-500">
          and {all.length - shown.length} more in the editor
        </p>
      )}
    </section>
  );
}
