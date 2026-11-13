import { useExportsStore } from "../../stores/exports.ts";
import type { ServerExport } from "../../export/server.ts";

interface ExportsPanelProps {
  run: (id: string, args?: unknown) => Promise<string | null>;
  onRemove: (id: string) => void;
}

const megabytes = (bytes: number | null | undefined): string =>
  bytes === null || bytes === undefined ? "" : `${(bytes / 1_000_000).toFixed(1)} MB`;

const STATUS: Record<ServerExport["status"], string> = {
  queued: "Waiting",
  running: "Exporting",
  done: "Ready",
  failed: "Failed",
  cancelled: "Cancelled",
};

/** Server exports of this project, newest first, with live progress (SSE), download and cancel. */
export function ExportsPanel({ run, onRemove }: ExportsPanelProps) {
  const items = useExportsStore((s) => s.items);
  const error = useExportsStore((s) => s.error);
  const browser = useExportsStore((s) => s.browser);
  return (
    <section aria-label="Exports" className="flex flex-col gap-2 p-3 text-xs">
      <h2 className="text-sm font-semibold">Exports</h2>
      {browser !== null && (
        <div className="rounded border border-sky-800 bg-sky-950/40 p-2">
          <p className="text-neutral-200">
            {browser.label} in this browser:{" "}
            {browser.phase === "sound"
              ? "mixing the sound…"
              : `frame ${String(browser.done)} of ${String(browser.total)}`}
          </p>
          <progress
            className="w-full"
            max={browser.total}
            value={browser.phase === "sound" ? 0 : browser.done}
          />
          <button
            type="button"
            onClick={() => void run("export.cancel")}
            className="mt-1 rounded bg-neutral-800 px-2 py-0.5 hover:bg-neutral-700"
          >
            Cancel
          </button>
        </div>
      )}
      {error !== null && (
        <p role="alert" className="text-red-300">
          {error}
        </p>
      )}
      {items.length === 0 && browser === null && (
        <p className="text-neutral-500">
          No server exports yet. Long videos, GIFs and MP3s are made on the server and listed here.
        </p>
      )}
      <ul className="flex flex-col gap-1.5">
        {items.map((item) => {
          const finished =
            item.status === "done" || item.status === "failed" || item.status === "cancelled";
          return (
            <li
              key={item.id}
              data-testid="export-row"
              className="rounded border border-neutral-800 p-2"
            >
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-medium text-neutral-100">
                  {item.name} · {item.settings.format.toUpperCase()}
                  {item.settings.format === "mp3" ? "" : ` ${item.settings.resolution}`}
                </span>
                <span
                  className={
                    item.status === "done"
                      ? "text-emerald-400"
                      : item.status === "failed"
                        ? "text-red-400"
                        : "text-neutral-400"
                  }
                >
                  {STATUS[item.status]}
                </span>
              </div>
              {!finished && <progress className="mt-1 w-full" max={1} value={item.progress} />}
              {item.errorMessage !== null && item.status === "failed" && (
                <p className="mt-1 text-red-300">{item.errorMessage}</p>
              )}
              {item.warnings.length > 0 && (
                <details className="mt-1 text-amber-300">
                  <summary>{item.warnings.length} note(s)</summary>
                  <ul className="list-disc pl-4">
                    {item.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </details>
              )}
              <div className="mt-1 flex gap-1">
                {item.downloadUrl !== null && item.downloadUrl !== undefined && (
                  <a
                    href={item.downloadUrl}
                    download
                    className="rounded bg-sky-700 px-2 py-0.5 text-white hover:bg-sky-600"
                  >
                    Download {megabytes(item.sizeBytes)}
                  </a>
                )}
                {!finished && (
                  <button
                    type="button"
                    onClick={() => void run("export.cancel", { id: item.id })}
                    className="rounded bg-neutral-800 px-2 py-0.5 hover:bg-neutral-700"
                  >
                    Cancel
                  </button>
                )}
                {finished && (
                  <button
                    type="button"
                    title="Remove this export and its file"
                    onClick={() => {
                      onRemove(item.id);
                    }}
                    className="rounded px-2 py-0.5 text-neutral-400 hover:bg-neutral-800"
                  >
                    Remove
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
