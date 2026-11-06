import type { Asset, Clip } from "@lumacut/schema";
import { endOf } from "@lumacut/ops";
import { usToPx } from "../../timeline/geometry.ts";
import { Icon } from "../Icon.tsx";
import { HANDLE_WIDTH, LANE_HEIGHT } from "./layout.ts";

export type ClipZone = "start" | "end" | "body";

interface ClipViewProps {
  clip: Clip;
  asset: Asset | undefined;
  zoomPxPerSec: number;
  selected: boolean;
  /** This clip is part of a drag that the project would refuse. */
  invalid: boolean;
  cursor: string;
  onPointerDown: (event: React.PointerEvent, clip: Clip, zone: ClipZone) => void;
}

/** One clip on a lane: a box from its start to its end, with a grab zone at each edge for trimming. */
export function ClipView({ clip, asset, zoomPxPerSec, selected, invalid, cursor, onPointerDown }: ClipViewProps) {
  const left = usToPx(clip.startUs, zoomPxPerSec);
  const width = Math.max(2, usToPx(endOf(clip) - clip.startUs, zoomPxPerSec));
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
      style={{ left, width, height: LANE_HEIGHT - 8, cursor }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        onPointerDown(e, clip, zoneOf(e));
      }}
    >
      <div className="pointer-events-none flex items-center gap-1 px-2 py-1">
        {clip.linkId !== undefined && <Icon name="link" className="h-3 w-3 shrink-0 opacity-70" />}
        <span className="truncate">{asset?.name ?? clip.type}</span>
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[7px] border-r border-white/20 bg-white/10" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-[7px] border-l border-white/20 bg-white/10" aria-hidden="true" />
    </div>
  );
}
