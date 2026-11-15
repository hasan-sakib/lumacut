import { STICKERS } from "@lumacut/templates";

/** Stickers and shapes: one click adds one at the playhead (it pops in). */
export function StickersPanel({ run }: { run: (id: string, args?: unknown) => void }) {
  return (
    <section aria-label="Stickers" className="flex flex-col gap-2 p-3 text-xs">
      <p className="text-neutral-400">Click a sticker to add it at the playhead.</p>
      <div className="grid grid-cols-3 gap-2">
        {STICKERS.map((s) => (
          <button
            key={s.id}
            type="button"
            title={`${s.name}: add it at the playhead`}
            aria-label={`Add the ${s.name} sticker`}
            onMouseDown={(e) => {
              e.preventDefault();
            }}
            onClick={() => {
              run("sticker.add", { sticker: s.id });
            }}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg bg-neutral-800 hover:bg-neutral-700"
          >
            <span className="text-2xl" aria-hidden>
              {s.text ?? "◆"}
            </span>
            <span className="text-[10px] text-neutral-300">{s.name}</span>
          </button>
        ))}
      </div>
      <p className="text-neutral-500">For more shapes use the drawing tools in Pro mode.</p>
    </section>
  );
}
