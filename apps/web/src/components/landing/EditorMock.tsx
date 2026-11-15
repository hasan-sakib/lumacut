import { galleryItems, Thumbnail } from "../templates/TemplateGallery.tsx";
import { Icon } from "../Icon.tsx";
import { DEMO } from "./demo.ts";

const FEATURED = galleryItems([]).find((t) => t.aspect === "16:9");

const TILES = [
  "from-sky-500 to-indigo-500",
  "from-fuchsia-500 to-rose-500",
  "from-amber-400 to-orange-500",
  "from-emerald-400 to-teal-500",
  "from-violet-500 to-purple-600",
  "from-neutral-500 to-neutral-700",
];

/** A waveform-like row of bars with a fixed, repeating pattern (decorative). */
function Bars({ count }: { count: number }) {
  return (
    <span className="flex h-full items-center gap-[2px] px-1.5">
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="w-[2px] rounded-full bg-current opacity-70"
          style={{ height: `${String(25 + ((i * 37) % 60))}%` }}
        />
      ))}
    </span>
  );
}

/**
 * A stylised editor window for the hero: the preview is a real template frame drawn by the engine;
 * the panels and timeline around it are a drawing of the app, not a screenshot.
 */
export function EditorMock() {
  return (
    <div
      aria-hidden="true"
      className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900 text-left shadow-2xl shadow-sky-950/30"
    >
      <div className="flex h-10 items-center gap-3 border-b border-neutral-800 px-4">
        <span className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
        </span>
        <span className="truncate text-xs font-medium text-neutral-400">Launch reel</span>
        <span className="ml-auto flex items-center gap-2">
          <span className="hidden rounded-full bg-neutral-800 p-0.5 text-[10px] font-medium sm:flex">
            <span className="px-2 py-0.5 text-neutral-400">Simple</span>
            <span className="rounded-full bg-sky-600 px-2 py-0.5 text-white">Pro</span>
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-2 py-1 text-[10px] font-semibold text-white">
            <Icon name="download" className="h-3 w-3" /> Export
          </span>
        </span>
      </div>

      <div className="grid sm:grid-cols-[1fr_11rem] lg:grid-cols-[1fr_14rem]">
        <div className="bg-neutral-950 p-3 sm:p-4">
          {FEATURED === undefined ? (
            <div className="aspect-video rounded-md bg-linear-to-br from-sky-600 to-indigo-700" />
          ) : (
            <Thumbnail item={FEATURED} variant={DEMO} />
          )}
        </div>
        <div className="hidden border-l border-neutral-800 p-3 sm:block">
          <div className="mb-3 flex gap-3 border-b border-neutral-800 pb-2 text-[10px] font-medium text-neutral-500">
            <span>Media</span>
            <span className="text-sky-400">Effects</span>
            <span>Text</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {TILES.map((tile) => (
              <span key={tile} className={`aspect-video rounded-md bg-linear-to-br ${tile}`} />
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-neutral-800 p-3">
        <div className="mb-2 flex items-center gap-3 text-neutral-500">
          <Icon name="undo" className="h-3.5 w-3.5" />
          <Icon name="select" className="h-3.5 w-3.5 text-sky-400" />
          <Icon name="split" className="h-3.5 w-3.5" />
          <Icon name="magnet" className="h-3.5 w-3.5" />
          <span className="mx-auto flex items-center gap-3">
            <Icon name="stepBack" className="h-3.5 w-3.5" />
            <Icon name="play" className="h-4 w-4 text-neutral-200" />
            <Icon name="stepForward" className="h-3.5 w-3.5" />
          </span>
          <span className="font-mono text-[10px]">00:00:04:12</span>
        </div>
        <div className="relative flex flex-col gap-1.5">
          <div className="flex h-5 gap-1.5 pl-[18%]">
            <span className="w-[34%] rounded bg-violet-500/80" />
            <span className="w-[22%] rounded bg-violet-500/50" />
          </div>
          <div className="flex h-7 gap-1">
            <span className="w-[30%] rounded bg-sky-500/80" />
            <span className="w-[26%] rounded bg-sky-500/60" />
            <span className="w-[38%] rounded bg-sky-500/80" />
          </div>
          <div className="h-6 w-[82%] overflow-hidden rounded bg-emerald-500/25 text-emerald-400">
            <Bars count={96} />
          </div>
          <span className="absolute -top-1 bottom-0 left-[41%] w-px bg-red-500" />
        </div>
      </div>
    </div>
  );
}
