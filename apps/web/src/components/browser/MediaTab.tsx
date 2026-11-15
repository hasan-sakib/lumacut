import type { AssetOut } from "../../api/client.ts";
import { formatBytes, formatDuration, formatPercent } from "../../lib/format.ts";
import type { UploadEntry } from "../../stores/uploads.ts";
import { Icon } from "../Icon.tsx";
import { AssetThumbnail } from "../library/AssetThumbnail.tsx";
import { durationUs } from "../library/AssetViews.tsx";
import { ProgressBar, statusText } from "../library/StatusBadge.tsx";
import { Tip } from "../Tip.tsx";

interface MediaTabProps {
  /** The library's ready assets. */
  assets: readonly AssetOut[];
  /** Photo projects add an image as a layer; videos add at the playhead. */
  photoMode: boolean;
  onAdd: (assetId: string) => void;
  /** Files on their way in: uploading from this tab, and library assets still being processed. */
  uploads: readonly UploadEntry[];
  processing: readonly AssetOut[];
  onImport: () => void;
  onCancel: (uploadKey: string) => void;
}

/** Your library as cards (poster, thumbnail or waveform); + puts one into the project. */
export function MediaTab({
  assets,
  photoMode,
  onAdd,
  uploads,
  processing,
  onImport,
  onCancel,
}: MediaTabProps) {
  const where = photoMode ? "as a new layer" : "at the playhead";
  return (
    <section aria-label="Add media" className="flex flex-col gap-3 p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{photoMode ? "Images" : "Media"}</h2>
          <p className="text-xs text-neutral-500">
            {photoMode
              ? "Add an image as a new layer."
              : "Add a clip at the playhead. Hover a video to scrub through it."}
          </p>
        </div>
        <Tip
          title={photoMode ? "Import photo" : "Import media"}
          description={
            photoMode
              ? "Choose images from your computer. Each one opens as a new layer."
              : "Choose videos, photos or music from your computer. They go onto the timeline when ready."
          }
          shortcut="Mod+I"
        >
          <button
            type="button"
            data-action="media.import"
            onClick={onImport}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-sky-600 px-3 text-xs font-semibold text-white hover:bg-sky-500 focus-visible:outline-2 focus-visible:outline-sky-400"
          >
            <Icon name="upload" className="h-3.5 w-3.5" /> Import
          </button>
        </Tip>
      </div>
      {(uploads.length > 0 || processing.length > 0) && (
        <ul aria-label="Importing" className="flex flex-col gap-1.5">
          {uploads.map((u) => {
            const fraction = u.uploadedBytes / Math.max(1, u.size);
            return (
              <li
                key={u.key}
                data-testid="import-entry"
                className="rounded-lg border border-neutral-800 bg-neutral-900 p-2 text-xs"
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium" title={u.name}>
                    {u.name}
                  </span>
                  <button
                    type="button"
                    title={u.state === "failed" ? "Dismiss" : "Cancel this import"}
                    aria-label={`Cancel importing ${u.name}`}
                    onClick={() => {
                      onCancel(u.key);
                    }}
                    className="grid h-5 w-5 place-items-center rounded text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
                  >
                    <Icon name="cancel" className="h-3 w-3" />
                  </button>
                </div>
                <ProgressBar value={fraction} label={`Uploading ${u.name}`} />
                <p className={`mt-1 ${u.state === "failed" ? "text-red-300" : "text-neutral-500"}`}>
                  {u.state === "failed"
                    ? (u.error ?? "Upload failed")
                    : `Uploading ${formatPercent(fraction)} of ${formatBytes(u.size)}`}
                </p>
              </li>
            );
          })}
          {processing.map((a) => (
            <li
              key={a.id}
              data-testid="import-entry"
              className="rounded-lg border border-neutral-800 bg-neutral-900 p-2 text-xs"
            >
              <p className="mb-1 truncate font-medium" title={a.name}>
                {a.name}
              </p>
              <ProgressBar value={a.progress} label={`Processing ${a.name}`} />
              <p className="mt-1 text-neutral-500">{statusText(a, undefined)}</p>
            </li>
          ))}
        </ul>
      )}
      {assets.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-neutral-700 px-4 py-8 text-center">
          <Icon name="upload" className="h-6 w-6 text-neutral-500" />
          <p className="text-xs text-neutral-500">
            {uploads.length > 0 || processing.length > 0
              ? "Your files will appear here when they are ready."
              : "Nothing here yet. Import files from your computer to start."}
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2">
          {assets.map((asset) => {
            const duration = durationUs(asset);
            return (
              <li
                key={asset.id}
                data-testid="media-card"
                className="group relative overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 transition hover:border-sky-500"
              >
                <AssetThumbnail asset={asset} />
                {duration !== null && duration > 0 && (
                  <span className="pointer-events-none absolute left-1 top-1 rounded bg-black/65 px-1 font-mono text-[10px] text-white">
                    {formatDuration(duration)}
                  </span>
                )}
                <div className="flex items-center gap-1.5 px-1.5 py-1">
                  <Icon name={asset.kind ?? "file"} className="h-3 w-3 shrink-0 text-neutral-500" />
                  <span
                    title={asset.name}
                    className="min-w-0 flex-1 truncate text-[11px] font-medium text-neutral-200"
                  >
                    {asset.name}
                  </span>
                  <Tip title={`Add ${where}`} description={asset.name}>
                    <button
                      type="button"
                      aria-label={`Add ${asset.name} ${where}`}
                      onMouseDown={(event) => {
                        event.preventDefault();
                      }}
                      onClick={() => {
                        onAdd(asset.id);
                      }}
                      className="grid h-5 w-5 shrink-0 place-items-center rounded bg-sky-600 text-white hover:bg-sky-500 focus-visible:outline-2 focus-visible:outline-sky-400"
                    >
                      <Icon name="plus" className="h-3 w-3" />
                    </button>
                  </Tip>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
