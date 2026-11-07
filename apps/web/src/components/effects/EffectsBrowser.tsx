import {
  EFFECT_CATEGORIES,
  effectsByCategory,
  searchEffects,
  searchTransitions,
} from "@lumacut/effects";
import { useMemo, useState } from "react";

interface EffectsBrowserProps {
  /** A picture clip is selected, so an effect can be added. */
  canAdd: boolean;
  /** A selected clip has a clip touching it on the left, so a transition can be added. */
  canTransition: boolean;
  /** Runs an action by id (`effect.add`, `layer.addSolid`…). */
  run: (id: string, args?: unknown) => void;
}

/** Every effect, searchable and grouped by category; clicking one adds it to the selected clips. */
export function EffectsBrowser({ canAdd, canTransition, run }: EffectsBrowserProps) {
  const [query, setQuery] = useState("");
  const groups = useMemo(() => {
    if (query.trim() === "") return effectsByCategory();
    const found = searchEffects(query);
    return EFFECT_CATEGORIES.map((category) => ({
      category,
      effects: found.filter((e) => e.category === category),
    })).filter((g) => g.effects.length > 0);
  }, [query]);
  const transitions = useMemo(() => searchTransitions(query), [query]);
  return (
    <section aria-label="Effects" className="flex flex-col gap-3 p-3 text-xs">
      <input
        type="search"
        aria-label="Search effects"
        placeholder="Search effects…"
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
        className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-neutral-100 outline-none focus:border-sky-500"
      />
      {!canAdd && <p className="text-neutral-500">Select a picture clip to add effects to it.</p>}
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          title="Add a flat colour clip at the playhead (a base for gradients and noise)."
          onMouseDown={(e) => {
            e.preventDefault();
          }}
          onClick={() => {
            run("layer.addSolid");
          }}
          className="rounded bg-neutral-800 px-2 py-1 text-neutral-200 hover:bg-neutral-700"
        >
          + Colour layer
        </button>
        <button
          type="button"
          title="Add a layer whose effects and colour apply to everything below it."
          onMouseDown={(e) => {
            e.preventDefault();
          }}
          onClick={() => {
            run("layer.addAdjustment");
          }}
          className="rounded bg-neutral-800 px-2 py-1 text-neutral-200 hover:bg-neutral-700"
        >
          + Adjustment layer
        </button>
      </div>
      {groups.length === 0 && (
        <p className="text-neutral-500">No effect matches “{query.trim()}”.</p>
      )}
      {groups.map((group) => (
        <div key={group.category}>
          <h3 className="mb-1 font-semibold text-neutral-300">{group.category}</h3>
          <ul className="flex flex-col gap-1">
            {group.effects.map((effect) => (
              <li key={effect.id}>
                <button
                  type="button"
                  disabled={!canAdd}
                  title={`${effect.name}: ${effect.description}`}
                  aria-label={`Add ${effect.name}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                  }}
                  onClick={() => {
                    run("effect.add", { effect: effect.id });
                  }}
                  className="w-full rounded px-2 py-1.5 text-left text-neutral-200 hover:bg-neutral-800 disabled:opacity-40"
                >
                  <span className="block font-medium">{effect.name}</span>
                  <span className="block text-neutral-500">{effect.description}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {transitions.length > 0 && (
        <div>
          <h3 className="mb-1 font-semibold text-neutral-300">Transitions</h3>
          {!canTransition && (
            <p className="mb-1 text-neutral-500">
              Select a clip that touches the clip before it to add a transition.
            </p>
          )}
          <ul className="flex flex-col gap-1">
            {transitions.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  disabled={!canTransition}
                  title={`${t.name}: ${t.description}`}
                  aria-label={`Add ${t.name} transition`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                  }}
                  onClick={() => {
                    run("transition.add", { transition: t.id });
                  }}
                  className="w-full rounded px-2 py-1.5 text-left text-neutral-200 hover:bg-neutral-800 disabled:opacity-40"
                >
                  <span className="block font-medium">{t.name}</span>
                  <span className="block text-neutral-500">{t.description}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
