import type { Asset, Clip } from "@lumacut/schema";
import { endOf } from "@lumacut/ops";
import { useClipMedia } from "../../editor/useClipMedia.ts";
import { filmstripTiles } from "../../timeline/filmstrip.ts";
import { usToPx } from "../../timeline/geometry.ts";
import { waveformSlice } from "../../timeline/waveform.ts";
import { Icon } from "../Icon.tsx";
import { HANDLE_WIDTH, LANE_HEIGHT } from "./layout.ts";

export type ClipZone = "start" | "end" | "body";

interface ClipViewProps {
  clip: Clip;
  asset: Asset | undefined;
  /** Pictures get a filmstrip, sound gets a waveform. */
  trackKind: "visual" | "audio";
  zoomPxPerSec: number;
  selected: boolean;
  /** This clip is part of a drag that the project would refuse. */
  invalid: boolean;
  cursor: string;
  /** The part of the timeline on screen, in timeline pixels: clips outside it draw no media. */
  viewFromPx?: number;
  viewToPx?: number;
  onPointerDown: (event: React.PointerEvent, clip: Clip, zone: ClipZone) => void;
  /** Right-click: the timeline selects the clip first, so the menu acts on what was clicked. */
  onContextMenu?: (clip: Clip) => void;
}

/** One clip on a lane: a box from its start to its end, with a grab zone at each edge for trimming. */
export function ClipView({
  clip,
  asset,
  trackKind,
  zoomPxPerSec,
  selected,
  invalid,
  cursor,
  viewFromPx,
  viewToPx,
  onPointerDown,
  onContextMenu,
}: ClipViewProps) {
  const left = usToPx(clip.startUs, zoomPxPerSec);
  const width = Math.max(2, usToPx(endOf(clip) - clip.startUs, zoomPxPerSec));
  const height = LANE_HEIGHT - 8;
  const onScreen =
    (viewToPx === undefined || left < viewToPx + 200) &&
    (viewFromPx === undefined || left + width > viewFromPx - 200);
  const media = useClipMedia(clip.assetId, onScreen);
  const visible =
    viewFromPx === undefined || viewToPx === undefined
      ? undefined
      : { fromPx: Math.max(0, viewFromPx - left - 100), toPx: viewToPx - left + 100 };
  const tiles =
    trackKind === "visual" && onScreen && media.thumbIndex !== null
      ? filmstripTiles(clip, media.thumbIndex, width, height, visible)
      : [];
  const bars =
    trackKind === "audio" && onScreen && media.waveform !== null
      ? waveformSlice(clip, media.waveform, Math.max(8, Math.min(400, Math.floor(width / 3))))
      : [];
  // One diamond per moment something on this clip is keyframed (clip-local times).
  const keyTimes = [
    ...new Set(Object.values(clip.keyframes).flatMap((frames) => frames.map((k) => k.tUs))),
  ].sort((a, b) => a - b);
  const tone = invalid
    ? "border-red-400 bg-red-900/70"
    : selected
      ? "border-sky-300 bg-sky-800"
      : clip.type === "media" && asset?.kind === "audio"
        ? "border-emerald-700 bg-emerald-900/80"
        : "border-neutral-500 bg-neutral-700";
  const zoneOf = (e: React.PointerEvent): ClipZone => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - box.left;
    if (x <= HANDLE_WIDTH) return "start";
    if (x >= box.width - HANDLE_WIDTH) return "end";
    return "body";
  };
  return (
    <div
      data-clip={clip.id}
      data-selected={selected}
      data-invalid={invalid}
      className={`absolute top-1 select-none overflow-hidden rounded border text-xs text-neutral-100 ${tone}`}
      style={{ left, width, height, cursor }}
      onContextMenu={() => {
        onContextMenu?.(clip);
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        onPointerDown(e, clip, zoneOf(e));
      }}
    >
      {tiles.length > 0 && media.thumbIndex !== null && (
        <div
          className="pointer-events-none absolute inset-0 overflow-hidden opacity-70"
          aria-hidden="true"
          data-testid="filmstrip"
        >
          {tiles.map((t) => {
            const src = media.sheets[t.sheet];
            return src === undefined ? null : (
              <div
                key={t.left}
                className="absolute top-0 overflow-hidden"
                style={{ left: t.left, width: t.width, height }}
              >
                <img
                  src={src}
                  crossOrigin="anonymous"
                  alt=""
                  className="absolute left-0 top-0 max-w-none"
                  style={{
                    width: `${String((media.thumbIndex?.columns ?? 1) * 100)}%`,
                    transform: `translate(${String((-t.col / (media.thumbIndex?.columns ?? 1)) * 100)}%, ${String((-t.row / t.rowsInSheet) * 100)}%)`,
                  }}
                />
              </div>
            );
          })}
        </div>
      )}
      {trackKind === "visual" && media.kind === "image" && media.thumb !== null && (
        <img
          src={media.thumb}
          crossOrigin="anonymous"
          alt=""
          aria-hidden="true"
          data-testid="image-thumb"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-70"
        />
      )}
      {bars.length > 0 && (
        <svg
          className="pointer-events-none absolute inset-x-0 bottom-0 h-3/4 w-full"
          viewBox={`0 0 ${String(bars.length)} 100`}
          preserveAspectRatio="none"
          aria-hidden="true"
          data-testid="clip-waveform"
        >
          {bars.map((v, i) => (
            <rect
              key={i}
              x={i + 0.15}
              width={0.7}
              y={50 - Math.max(2, v * 100) / 2}
              height={Math.max(2, v * 100)}
              className="fill-emerald-300/80"
            />
          ))}
        </svg>
      )}
      <div className="pointer-events-none relative flex items-center gap-1 px-2 py-1 [text-shadow:0_1px_2px_rgba(0,0,0,0.8)]">
        {clip.linkId !== undefined && <Icon name="link" className="h-3 w-3 shrink-0 opacity-70" />}
        <span className="truncate">{asset?.name ?? clip.type}</span>
      </div>
      {clip.transitionIn !== undefined && (
        <div
          data-testid="clip-transition"
          title={`Transition from the previous clip: ${clip.transitionIn.transitionId}`}
          className="pointer-events-none absolute inset-y-0 left-0 border-r border-sky-300/60 bg-gradient-to-r from-sky-300/50 to-transparent"
          style={{
            width: Math.max(6, Math.min(width, usToPx(clip.transitionIn.durationUs, zoomPxPerSec))),
          }}
          aria-hidden="true"
        />
      )}
      {keyTimes.length > 0 && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-3"
          aria-hidden="true"
          data-testid="clip-keyframes"
        >
          {keyTimes.map((t) => (
            <span
              key={t}
              data-keyframe-time={t}
              className="absolute bottom-0.5 h-2 w-2 -translate-x-1 rotate-45 border border-sky-950 bg-sky-300"
              style={{ left: usToPx(t, zoomPxPerSec) }}
            />
          ))}
        </div>
      )}
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-[7px] border-r border-white/20 bg-white/10"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 w-[7px] border-l border-white/20 bg-white/10"
        aria-hidden="true"
      />
    </div>
  );
}
