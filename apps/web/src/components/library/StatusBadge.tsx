import type { AssetOut } from "../../api/client.ts";
import { formatPercent } from "../../lib/format.ts";
import type { UploadEntry } from "../../stores/uploads.ts";

const STAGE_LABELS: Record<string, string> = {
  download: "Preparing",
  probe: "Reading file",
  proxy: "Creating proxy",
  master: "Creating master",
  thumbnails: "Thumbnails",
  waveform: "Waveform",
  image: "Processing image",
  finalizing: "Finishing",
};

/** One text label per state; color is a secondary cue only. */
export function statusText(asset: AssetOut, upload: UploadEntry | undefined): string {
  if (upload) {
    if (upload.state === "failed") return "Upload failed";
    return `Uploading ${formatPercent(upload.uploadedBytes / Math.max(1, upload.size))}`;
  }
  switch (asset.status) {
    case "uploading":
      return "Upload paused";
    case "queued":
      return "Queued";
    case "processing":
      return `${STAGE_LABELS[asset.stage ?? ""] ?? "Processing"} ${formatPercent(asset.progress)}`;
    case "ready":
      return "Ready";
    case "failed":
      return "Failed";
  }
}

const TONE: Record<string, string> = {
  ready: "bg-emerald-900/70 text-emerald-200",
  failed: "bg-red-900/70 text-red-200",
  uploading: "bg-amber-900/70 text-amber-200",
  busy: "bg-sky-900/70 text-sky-200",
};

export function StatusBadge({
  asset,
  upload,
}: {
  asset: AssetOut;
  upload?: UploadEntry | undefined;
}) {
  const tone =
    upload?.state === "failed" || asset.status === "failed"
      ? TONE.failed
      : asset.status === "ready"
        ? TONE.ready
        : asset.status === "uploading" && !upload
          ? TONE.uploading
          : TONE.busy;
  return (
    <span
      data-testid="asset-status"
      className={`rounded px-2 py-0.5 text-xs font-medium ${tone ?? ""}`}
    >
      {statusText(asset, upload)}
    </span>
  );
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      className="h-1 w-full overflow-hidden rounded bg-neutral-800"
    >
      <div
        className="h-full bg-sky-500 transition-[width]"
        style={{ width: `${String(value * 100)}%` }}
      />
    </div>
  );
}
