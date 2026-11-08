import { Dialog } from "radix-ui";
import { useState } from "react";

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The canvas size, to show the size of the file that will be made. */
  canvas: { width: number; height: number };
  /** A video frame (not a photo): the picture at the playhead. */
  frame: boolean;
  /** Runs the registry action (`export.image`); resolves with an error message or null. */
  run: (id: string, args?: unknown) => Promise<string | null>;
}

type Format = "png" | "jpeg" | "webp";
const LABEL: Record<Format, string> = {
  png: "PNG (lossless, keeps transparency)",
  jpeg: "JPEG (smaller, no transparency)",
  webp: "WebP (small, keeps transparency)",
};

/** Save the picture as an image file: type, quality, size and the colour behind transparency. */
export function ExportDialog({ open, onOpenChange, canvas, frame, run }: ExportDialogProps) {
  const [format, setFormat] = useState<Format>("png");
  const [quality, setQuality] = useState(92);
  const [percent, setPercent] = useState(100);
  const [flatten, setFlatten] = useState(false);
  const [colour, setColour] = useState("#ffffff");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const width = Math.max(1, Math.round((canvas.width * percent) / 100));
  const height = Math.max(1, Math.round((canvas.height * percent) / 100));
  const lossy = format !== "png";

  async function start() {
    setBusy(true);
    setError(null);
    const message = await run("export.image", {
      format,
      quality,
      percent,
      ...(format === "jpeg" || flatten ? { background: colour } : {}),
    });
    setBusy(false);
    if (message === null) onOpenChange(false);
    else setError(message);
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-24 z-50 w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-neutral-700 bg-neutral-900 p-5 shadow-2xl"
        >
          <Dialog.Title className="mb-3 text-base font-semibold text-neutral-100">
            {frame ? "Export this frame" : "Export image"}
          </Dialog.Title>
          <div className="flex flex-col gap-3 text-sm text-neutral-200">
            <label className="flex flex-col gap-1">
              File type
              <select
                value={format}
                onChange={(e) => {
                  setFormat(e.target.value as Format);
                }}
                className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5"
              >
                {(Object.keys(LABEL) as Format[]).map((f) => (
                  <option key={f} value={f}>
                    {LABEL[f]}
                  </option>
                ))}
              </select>
            </label>
            {lossy && (
              <label className="flex items-center gap-2">
                Quality
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={quality}
                  aria-label="Quality"
                  onChange={(e) => {
                    setQuality(Number(e.target.value));
                  }}
                  className="flex-1"
                />
                <span className="w-9 text-right tabular-nums text-neutral-400">{quality}</span>
              </label>
            )}
            <label className="flex items-center gap-2">
              Size
              <input
                type="range"
                min={10}
                max={400}
                step={5}
                value={percent}
                aria-label="Size in percent"
                onChange={(e) => {
                  setPercent(Number(e.target.value));
                }}
                className="flex-1"
              />
              <span className="w-12 text-right tabular-nums text-neutral-400">{percent}%</span>
            </label>
            <p className="text-xs text-neutral-400">
              {width} × {height} px
            </p>
            {format !== "jpeg" && (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={flatten}
                  onChange={(e) => {
                    setFlatten(e.target.checked);
                  }}
                />
                Fill transparent areas with a colour
              </label>
            )}
            {(format === "jpeg" || flatten) && (
              <label className="flex items-center gap-2">
                Background
                <input
                  type="color"
                  value={colour}
                  aria-label="Background colour"
                  onChange={(e) => {
                    setColour(e.target.value);
                  }}
                  className="h-7 w-10 cursor-pointer rounded border border-neutral-700 bg-transparent"
                />
              </label>
            )}
            {error !== null && (
              <p role="alert" className="rounded bg-red-950/60 px-2 py-1 text-xs text-red-300">
                {error}
              </p>
            )}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                onOpenChange(false);
              }}
              className="rounded bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700 disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void start()}
              className="rounded bg-sky-600 px-3 py-1.5 text-sm text-white hover:bg-sky-500 disabled:opacity-60"
            >
              {busy ? "Rendering…" : "Export"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
