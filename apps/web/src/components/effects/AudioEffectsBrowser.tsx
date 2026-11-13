import { audioEffectsByCategory } from "@lumacut/effects";

interface AudioEffectsBrowserProps {
  /** An audio clip is selected. */
  canAdd: boolean;
  run: (id: string, args?: unknown) => void;
}

/** The audio effects, by category; clicking one adds it to the selected audio clips. */
export function AudioEffectsBrowser({ canAdd, run }: AudioEffectsBrowserProps) {
  return (
    <section
      aria-label="Audio effects"
      className="flex flex-col gap-2 border-b border-neutral-800 p-3 text-xs"
    >
      <h3 className="font-semibold text-neutral-300">Audio effects</h3>
      {!canAdd && (
        <p className="text-neutral-500">Select an audio clip to add sound effects to it.</p>
      )}
      {audioEffectsByCategory().map((group) => (
        <div key={group.category}>
          <h4 className="mb-1 text-neutral-400">{group.category}</h4>
          <div className="flex flex-wrap gap-1">
            {group.effects.map((effect) => (
              <button
                key={effect.id}
                type="button"
                disabled={!canAdd}
                title={`${effect.name}: ${effect.description}`}
                aria-label={`Add ${effect.name}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                }}
                onClick={() => {
                  run("audio.addEffect", { effect: effect.id });
                }}
                className="rounded bg-neutral-800 px-2 py-1 text-neutral-200 hover:bg-neutral-700 disabled:opacity-40"
              >
                {effect.name}
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
