import type { AssetOut } from "../../api/client.ts";
import type { LibraryContext } from "../../actions/library.ts";
import { libraryActions } from "../../actions/library.ts";
import { formatBytes, formatDuration } from "../../lib/format.ts";
import { entryForAsset, type UploadEntry } from "../../stores/uploads.ts";
import { ActionButton } from "../ActionButton.tsx";
import { Icon } from "../Icon.tsx";
import { AssetThumbnail } from "./AssetThumbnail.tsx";
import { ProgressBar, StatusBadge, statusText } from "./StatusBadge.tsx";

/** Actions shown on each card / row, in order; each appears only when available. */
const ITEM_ACTIONS = ["upload.resume", "upload.cancel", "asset.retry", "asset.delete"] as const;

export function durationUs(asset: AssetOut): number | null {
  return asset.media?.video?.durationUs ?? asset.media?.audio?.durationUs ?? null;
}

export function resolution(asset: AssetOut): string | null {
  const dims = asset.media?.video ?? asset.media?.image;
  return dims ? `${String(dims.width)}×${String(dims.height)}` : null;
}

function itemContext(
  base: LibraryContext,
  asset: AssetOut,
  uploads: Record<string, UploadEntry>,
): LibraryContext {
  return { ...base, asset, uploadKey: entryForAsset(uploads, asset.id)?.key ?? null };
}

function ItemActions({ ctx }: { ctx: LibraryContext }) {
  return (
    <div className="flex items-center gap-1">
      {ITEM_ACTIONS.map((id) => {
        const action = libraryActions.get(id);
        return action.when(ctx) ? (
          <ActionButton
            key={id}
            action={action}
            ctx={ctx}
            variant="icon"
            className="text-neutral-300 hover:bg-neutral-800"
          />
        ) : null;
      })}
    </div>
  );
}

function progressOf(asset: AssetOut, upload: UploadEntry | undefined): number | null {
  if (upload) return upload.uploadedBytes / Math.max(1, upload.size);
  if (asset.status === "processing") return asset.progress;
  return null;
}

interface ViewProps {
  assets: AssetOut[];
  ctx: LibraryContext;
  uploads: Record<string, UploadEntry>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function AssetGrid({ assets, ctx, uploads, selectedId, onSelect }: ViewProps) {
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4" aria-label="Assets">
      {assets.map((asset) => {
        const upload = entryForAsset(uploads, asset.id);
        const progress = progressOf(asset, upload);
        const duration = durationUs(asset);
        const res = resolution(asset);
        return (
          <li
            key={asset.id}
            data-testid="asset-card"
            data-asset-id={asset.id}
            data-status={asset.status}
            aria-selected={selectedId === asset.id}
            tabIndex={0}
            onClick={() => {
              onSelect(asset.id);
            }}
            onFocus={() => {
              onSelect(asset.id);
            }}
            className={`rounded-lg border bg-neutral-950 outline-none transition focus-visible:ring-2 focus-visible:ring-sky-400 ${
              selectedId === asset.id
                ? "border-sky-500"
                : "border-neutral-800 hover:border-neutral-600"
            }`}
          >
            <AssetThumbnail asset={asset} />
            {progress !== null && (
              <ProgressBar value={progress} label={statusText(asset, upload)} />
            )}
            <div className="space-y-2 p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="truncate text-sm font-medium" title={asset.name}>
                  {asset.name}
                </p>
                <Icon
                  name={asset.kind ?? "file"}
                  className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500"
                />
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-400">
                {duration !== null && (
                  <span data-testid="asset-duration">{formatDuration(duration)}</span>
                )}
                {res && <span data-testid="asset-resolution">{res}</span>}
                {asset.media?.downscaledFrom && (
                  <span title="The editor uses a copy within the 8192 px limit">
                    Downscaled from {asset.media.downscaledFrom.width}×
                    {asset.media.downscaledFrom.height}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <StatusBadge asset={asset} upload={upload} />
                <ItemActions ctx={itemContext(ctx, asset, uploads)} />
              </div>
              {(asset.status === "failed" || upload?.state === "failed") && (
                <p role="alert" className="text-xs text-red-300">
                  {upload?.error ?? asset.errorMessage}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function AssetTable({ assets, ctx, uploads, selectedId, onSelect }: ViewProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-800">
      <table className="w-full text-left text-sm">
        <thead className="bg-neutral-900 text-xs uppercase tracking-wide text-neutral-400">
          <tr>
            <th className="px-3 py-2 font-medium">Name</th>
            <th className="px-3 py-2 font-medium">Kind</th>
            <th className="px-3 py-2 font-medium">Duration</th>
            <th className="px-3 py-2 font-medium">Resolution</th>
            <th className="px-3 py-2 font-medium">Size</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Added</th>
            <th className="px-3 py-2 font-medium">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800">
          {assets.map((asset) => {
            const upload = entryForAsset(uploads, asset.id);
            const duration = durationUs(asset);
            return (
              <tr
                key={asset.id}
                data-testid="asset-row"
                data-asset-id={asset.id}
                aria-selected={selectedId === asset.id}
                tabIndex={0}
                onClick={() => {
                  onSelect(asset.id);
                }}
                onFocus={() => {
                  onSelect(asset.id);
                }}
                className={`outline-none focus-visible:bg-neutral-800 ${selectedId === asset.id ? "bg-neutral-900" : ""}`}
              >
                <td className="max-w-72 truncate px-3 py-2" title={asset.name}>
                  {asset.name}
                </td>
                <td className="px-3 py-2 capitalize text-neutral-400">{asset.kind ?? "—"}</td>
                <td className="px-3 py-2 text-neutral-400">
                  {duration === null ? "—" : formatDuration(duration)}
                </td>
                <td className="px-3 py-2 text-neutral-400">{resolution(asset) ?? "—"}</td>
                <td className="px-3 py-2 text-neutral-400">{formatBytes(asset.sizeBytes)}</td>
                <td className="px-3 py-2">
                  <StatusBadge asset={asset} upload={upload} />
                </td>
                <td className="px-3 py-2 text-neutral-400">
                  {new Date(asset.createdAt).toLocaleDateString()}
                </td>
                <td className="px-3 py-2">
                  <ItemActions ctx={itemContext(ctx, asset, uploads)} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
