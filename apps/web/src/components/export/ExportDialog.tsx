import { Dialog } from "radix-ui";
import { useState } from "react";
import { useExportsStore } from "../../stores/exports.ts";

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

type Format = "mp4" | "webm" | "gif" | "png" | "jpeg" | "webp" | "wav" | "mp3";
const LABEL: Record<Format, string> = {
  mp4: "Video: MP4 (H.264 + AAC, plays everywhere)",
  webm: "Video: WebM (VP9 + Opus)",
  gif: "Animated GIF (up to 15 s, made on the server)",
  wav: "Audio: WAV (the whole mix)",
  mp3: "Audio: MP3 (made on the server)",
  png: "PNG (lossless, keeps transparency)",
  jpeg: "JPEG (smaller, no transparency)",
  webp: "WebP (small, keeps transparency)",
};

const ONLY_VIDEO: readonly Format[] = ["mp4", "webm", "gif", "wav", "mp3"];

/**
 * The export window: video (MP4 / WebM, in this browser or on the server), GIF, audio (WAV, MP3),
 * or a still image (a photo, or the frame at the playhead). Every choice runs a registry action.
 */
export function ExportDialog({ open, onOpenChange, canvas, frame, run }: ExportDialogProps) {
  const [format, setFormat] = useState<Format>(frame ? "mp4" : "png");
  const [resolution, setResolution] = useState<"720p" | "1080p" | "source">("1080p");
  const [fps, setFps] = useState<"auto" | "24" | "25" | "30" | "60">("auto");
  const [videoQuality, setVideoQuality] = useState<"high" | "medium" | "small">("high");
  const [where, setWhere] = useState<"auto" | "browser" | "server">("auto");
  const browser = useExportsStore((s) => s.browser);
  const [quality, setQuality] = useState(92);
  const [percent, setPercent] = useState(100);
  const [flatten, setFlatten] = useState(false);
  const [colour, setColour] = useState("#ffffff");
  const [busy, setBusy] = useState(false);
  const [loudness, setLoudness] = useState<"none" | "social" | "broadcast">("social");
  const [bits, setBits] = useState<"16" | "24">("24");
  const [error, setError] = useState<string | null>(null);
  const width = Math.max(1, Math.round((canvas.width * percent) / 100));
  const height = Math.max(1, Math.round((canvas.height * percent) / 100));
  const audio = format === "wav";
  const image = format === "png" || format === "jpeg" || format === "webp";
  const video = format === "mp4" || format === "webm" || format === "gif";
  const sound = format === "wav" || format === "mp3" || format === "mp4" || format === "webm";
  const lossy = format === "jpeg" || format === "webp";
  const fpsArg = fps === "auto" ? {} : { fps: Number(fps) };

  async function start() {
    setBusy(true);
    setError(null);
    const message =
      format === "mp4" || format === "webm"
        ? await run("export.video", {
            format,
            resolution,
            quality: videoQuality,
            loudness,
            where,
            ...fpsArg,
          })
        : format === "gif"
          ? await run("export.gif", {
              resolution: resolution === "1080p" ? "720p" : resolution,
              ...fpsArg,
            })
          : format === "mp3"
            ? await run("export.mp3", { loudness })
            : audio
              ? await run("export.audio", { target: loudness, bits })
              : await run("export.image", {
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
            {video
              ? "Export video"
              : audio || format === "mp3"
                ? "Export audio"
                : frame
                  ? "Export this frame"
                  : "Export image"}
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
                {(Object.keys(LABEL) as Format[])
                  .filter((f) => frame || !ONLY_VIDEO.includes(f))
                  .map((f) => (
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
            {video && (
              <>
                <label className="flex items-center gap-2">
                  Size
                  <select
                    value={resolution}
                    onChange={(e) => {
                      setResolution(e.target.value as "720p" | "1080p" | "source");
                    }}
                    className="flex-1 rounded border border-neutral-700 bg-neutral-950 px-2 py-1"
                  >
                    <option value="1080p">1080p</option>
                    <option value="720p">720p</option>
                    <option value="source">
                      Composition size ({canvas.width} × {canvas.height})
                    </option>
                  </select>
                </label>
                <label className="flex items-center gap-2">
                  Frame rate
                  <select
                    value={fps}
                    onChange={(e) => {
                      setFps(e.target.value as "auto" | "24" | "25" | "30" | "60");
                    }}
                    className="flex-1 rounded border border-neutral-700 bg-neutral-950 px-2 py-1"
                  >
                    <option value="auto">Same as the composition</option>
                    <option value="24">24 fps</option>
                    <option value="25">25 fps</option>
                    <option value="30">30 fps</option>
                    <option value="60">60 fps</option>
                  </select>
                </label>
                {format !== "gif" && (
                  <>
                    <label className="flex items-center gap-2">
                      Quality
                      <select
                        value={videoQuality}
                        onChange={(e) => {
                          setVideoQuality(e.target.value as "high" | "medium" | "small");
                        }}
                        className="flex-1 rounded border border-neutral-700 bg-neutral-950 px-2 py-1"
                      >
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="small">Small file</option>
                      </select>
                    </label>
                    <label className="flex items-center gap-2">
                      Made
                      <select
                        value={where}
                        onChange={(e) => {
                          setWhere(e.target.value as "auto" | "browser" | "server");
                        }}
                        className="flex-1 rounded border border-neutral-700 bg-neutral-950 px-2 py-1"
                      >
                        <option value="auto">Automatically (browser for short videos)</option>
                        <option value="browser">In this browser (up to 10 min)</option>
                        <option value="server">On the server (any length)</option>
                      </select>
                    </label>
                  </>
                )}
              </>
            )}
            {sound && (
              <>
                <label className="flex flex-col gap-1">
                  Loudness
                  <select
                    value={loudness}
                    onChange={(e) => {
                      setLoudness(e.target.value as "none" | "social" | "broadcast");
                    }}
                    className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5"
                  >
                    <option value="social">−14 LUFS (social media, streaming)</option>
                    <option value="broadcast">−23 LUFS (broadcast, EBU R 128)</option>
                    <option value="none">As mixed (no change)</option>
                  </select>
                </label>
                {audio && (
                  <label className="flex items-center gap-2">
                    Bit depth
                    <select
                      value={bits}
                      onChange={(e) => {
                        setBits(e.target.value as "16" | "24");
                      }}
                      className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1"
                    >
                      <option value="24">24-bit</option>
                      <option value="16">16-bit</option>
                    </select>
                  </label>
                )}
                <p className="text-xs text-neutral-400">
                  The whole composition, stereo 48 kHz. True peaks are kept under −1 dBTP.
                </p>
              </>
            )}
            {image && (
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
            )}
            {image && (
              <p className="text-xs text-neutral-400">
                {width} × {height} px
              </p>
            )}
            {image && format !== "jpeg" && (
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
            {image && (format === "jpeg" || flatten) && (
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
            {browser !== null && (
              <div className="flex flex-col gap-1" aria-live="polite">
                <p className="text-xs text-neutral-300">
                  {browser.phase === "sound"
                    ? "Mixing the sound…"
                    : `Drawing and encoding frame ${String(browser.done)} of ${String(browser.total)}`}
                </p>
                <progress
                  className="w-full"
                  max={browser.total}
                  value={browser.phase === "sound" ? 0 : browser.done}
                />
                <button
                  type="button"
                  onClick={() => void run("export.cancel")}
                  className="self-start rounded bg-neutral-800 px-2 py-1 text-xs hover:bg-neutral-700"
                >
                  Cancel export
                </button>
              </div>
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
