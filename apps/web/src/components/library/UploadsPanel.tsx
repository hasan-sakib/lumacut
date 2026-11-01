import type { LibraryContext } from "../../actions/library.ts";
import { libraryActions } from "../../actions/library.ts";
import { formatBytes, formatPercent } from "../../lib/format.ts";
import type { UploadEntry } from "../../stores/uploads.ts";
import { ActionButton } from "../ActionButton.tsx";
import { ProgressBar } from "./StatusBadge.tsx";

/** In-flight uploads of this tab, newest last. */
export function UploadsPanel({ entries, ctx }: { entries: UploadEntry[]; ctx: LibraryContext }) {
  if (entries.length === 0) return null;
  const cancel = libraryActions.get("upload.cancel");
  return (
    <section
      aria-label="Uploads"
      className="fixed bottom-4 right-4 z-40 w-80 space-y-3 rounded-lg border border-neutral-700 bg-neutral-900 p-4 shadow-xl"
    >
      <h2 className="text-sm font-semibold">Uploads</h2>
      {entries.map((entry) => {
        const fraction = entry.uploadedBytes / Math.max(1, entry.size);
        return (
          <div key={entry.key} className="space-y-1" data-testid="upload-entry">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate" title={entry.name}>
                {entry.name}
              </span>
              <ActionButton
                action={cancel}
                ctx={{ ...ctx, asset: null, uploadKey: entry.key }}
                variant="icon"
                className="text-neutral-400 hover:bg-neutral-800"
              />
            </div>
            <ProgressBar value={fraction} label={`Uploading ${entry.name}`} />
            <p
              className={`text-xs ${entry.state === "failed" ? "text-red-300" : "text-neutral-400"}`}
            >
              {entry.state === "failed"
                ? entry.error
                : `${formatPercent(fraction)} of ${formatBytes(entry.size)}`}
            </p>
          </div>
        );
      })}
    </section>
  );
}
