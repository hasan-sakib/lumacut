import { Icon } from "../Icon.tsx";

interface ImportDropZoneProps {
  /** Photo projects take images only. */
  photo: boolean;
  /** Files are being dragged over the editor right now. */
  dragging: boolean;
  shortcut: string | null;
  onImport: () => void;
}

/** What an empty project shows where the picture will be: import something to start. */
export function ImportDropZone({ photo, dragging, shortcut, onImport }: ImportDropZoneProps) {
  return (
    <div
      data-testid="import-zone"
      className="absolute inset-0 z-10 grid place-items-center bg-neutral-950/90 p-6"
    >
      <div
        className={`flex w-full max-w-md flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-8 py-10 text-center transition ${
          dragging ? "border-sky-400 bg-sky-500/10" : "border-neutral-700"
        }`}
      >
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-sky-500/15 text-sky-400">
          <Icon name={photo ? "image" : "video"} className="h-7 w-7" />
        </span>
        <p className="text-base font-semibold text-neutral-100">
          {photo ? "Import a photo to start" : "Import videos, photos or music to start"}
        </p>
        <p className="text-sm text-neutral-400">
          {photo
            ? "Choose an image from your computer, or drop it here. It opens as a layer."
            : "Choose files from your computer, or drop them here. They go onto the timeline when ready."}
        </p>
        <button
          type="button"
          onClick={onImport}
          className="mt-2 inline-flex h-10 items-center gap-2 rounded-lg bg-sky-600 px-5 text-sm font-semibold text-white hover:bg-sky-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
        >
          <Icon name="upload" />
          {photo ? "Import photo" : "Import media"}
          {shortcut !== null && (
            <kbd className="rounded bg-white/15 px-1.5 py-0.5 font-mono text-[11px]">
              {shortcut}
            </kbd>
          )}
        </button>
        <p className="text-xs text-neutral-500">
          Or use a file already in your library from the Media tab.
        </p>
      </div>
    </div>
  );
}
