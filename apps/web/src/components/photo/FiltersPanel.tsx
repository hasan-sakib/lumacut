import { BUILTIN_LUTS } from "@lumacut/engine/color";
import { EffectsBrowser } from "../effects/EffectsBrowser.tsx";

interface FiltersPanelProps {
  canAdd: boolean;
  run: (id: string, args?: unknown) => Promise<string | null>;
}

/**
 * Filters: one-click looks (each becomes an adjustment layer you can fade) and the whole effects
 * library for the selected layer.
 */
export function FiltersPanel({ canAdd, run }: FiltersPanelProps) {
  return (
    <div className="flex flex-col">
      <section
        aria-label="Looks"
        className="flex flex-col gap-2 border-b border-neutral-800 p-3 text-xs"
      >
        <h3 className="font-semibold text-neutral-300">Looks</h3>
        <p className="text-neutral-500">
          Adds an adjustment layer over the whole picture. Lower its opacity to soften the look.
        </p>
        <div className="flex flex-wrap gap-1">
          {BUILTIN_LUTS.map((look) => (
            <button
              key={look.id}
              type="button"
              title={look.description}
              onMouseDown={(e) => {
                e.preventDefault();
              }}
              onClick={() => void run("layer.addLook", { look: look.id })}
              className="rounded bg-neutral-800 px-2 py-1 text-neutral-200 hover:bg-neutral-700"
            >
              {look.name}
            </button>
          ))}
        </div>
      </section>
      <EffectsBrowser
        canAdd={canAdd}
        canTransition={false}
        run={(id, args) => void run(id, args)}
      />
    </div>
  );
}
