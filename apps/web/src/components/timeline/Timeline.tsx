import type { AnyAction } from "@lumacut/actions";
import { endOf } from "@lumacut/ops";
import type { Clip, Composition, Op, Project } from "@lumacut/schema";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { EditingContext } from "../../actions/editing.ts";
import type { Tool } from "../../stores/editor.ts";
import { findPlaced, withLinked } from "../../timeline/clips.ts";
import { clampZoom, pxToUs, scrollAfterZoom, usToPx } from "../../timeline/geometry.ts";
import {
  moveGesture,
  previewGesture,
  razorGesture,
  rollGesture,
  slideGesture,
  slipGesture,
  snapExclusions,
  trimGesture,
  type GestureEnv,
  type GestureKind,
  type GestureResult,
  type Preview,
} from "../../timeline/gestures.ts";
import { snapPoints } from "../../timeline/snapping.ts";
import { ClipView, type ClipZone } from "./ClipView.tsx";
import { DRAG_THRESHOLD_PX, HEADER_WIDTH, LANE_HEIGHT, RULER_HEIGHT, SNAP_PX, TAIL_US } from "./layout.ts";
import { Ruler } from "./Ruler.tsx";
import { TrackHeader } from "./TrackHeader.tsx";

export interface TimelineProps {
  project: Project;
  composition: Composition;
  ctx: EditingContext;
  tool: Tool;
  zoomPxPerSec: number;
  /** Time at the left edge of the visible area. */
  scrollUs: number;
  snapping: boolean;
  playheadUs: number;
  playing: boolean;
  selectedClipIds: readonly string[];
  selectedTrackId: string | null;
  newId: () => string;
  onSelectClips: (ids: string[]) => void;
  onSelectTrack: (id: string | null) => void;
  onSeek: (us: number) => void;
  /** Apply an edit (one undo step). */
  onCommit: (op: Op, label: string) => void;
  onRunAction: (action: AnyAction<EditingContext>, args?: unknown) => void;
  onZoom: (pxPerSec: number, scrollUs: number) => void;
  onScroll: (scrollUs: number) => void;
  onViewport: (px: number) => void;
}

interface Drag {
  kind: GestureKind;
  clipId: string;
  edge?: "start" | "end";
  ripple?: boolean;
  rollLeft?: string;
  rollRight?: string;
  startX: number;
  startY: number;
  originLeft: number;
  moved: boolean;
  points: number[];
  selectedIds: string[];
  result: GestureResult | null;
  preview: Preview | null;
}

const LABELS: Record<GestureKind, string> = {
  move: "Move clips",
  trim: "Trim clip",
  roll: "Roll edit",
  slip: "Slip clip",
  slide: "Slide clip",
  razor: "Split clips",
};

const CURSORS: Record<Tool, string> = {
  select: "grab",
  razor: "crosshair",
  ripple: "col-resize",
  roll: "col-resize",
  slip: "ew-resize",
  slide: "ew-resize",
};

/** The neighbour whose edge touches this edge of the clip, if any (for roll edits). */
function adjacent(comp: Composition, clip: Clip, edge: "start" | "end"): Clip | undefined {
  const placed = findPlaced(comp, clip.id);
  return placed?.track.clips.find((c) => c.id !== clip.id && (edge === "start" ? endOf(c) === clip.startUs : c.startUs === endOf(clip)));
}

/**
 * The multi-track timeline. It draws the project (or, while a drag is in progress, what the
 * project would be after the drag), and turns pointer gestures into one op each through the pure
 * functions in `timeline/gestures.ts`. Nothing here edits the document directly.
 */
export function Timeline(props: TimelineProps) {
  const { project, composition, tool, zoomPxPerSec: zoom, scrollUs, snapping, playheadUs, playing, selectedClipIds, selectedTrackId } = props;
  const scroller = useRef<HTMLDivElement>(null);
  const laneRefs = useRef(new Map<string, HTMLDivElement>());
  const [viewportPx, setViewportPx] = useState(0);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const live = useRef(props);
  live.current = props;

  // --- Viewport, scrolling, zoom ----------------------------------------------------------------
  useEffect(() => {
    const el = scroller.current;
    if (el === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const width = Math.max(0, el.clientWidth - HEADER_WIDTH);
      setViewportPx(width);
      live.current.onViewport(width);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, []);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el === null) return;
    const wanted = usToPx(scrollUs, zoom);
    if (Math.abs(el.scrollLeft - wanted) > 1) el.scrollLeft = wanted;
  }, [scrollUs, zoom]);

  // Ctrl/Cmd + wheel zooms around the pointer. (A native listener: React's wheel handlers are passive.)
  useEffect(() => {
    const el = scroller.current;
    if (el === null) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const p = live.current;
      const next = clampZoom(p.zoomPxPerSec * Math.exp(-e.deltaY / 300));
      const anchor = e.clientX - el.getBoundingClientRect().left - HEADER_WIDTH;
      p.onZoom(next, scrollAfterZoom(p.scrollUs, anchor, p.zoomPxPerSec, next));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
    };
  }, []);

  // While playing, keep the playhead in view.
  useEffect(() => {
    if (!playing || viewportPx === 0) return;
    const x = usToPx(playheadUs - scrollUs, zoom);
    if (x < 0 || x > viewportPx - 40) live.current.onScroll(Math.max(0, playheadUs - pxToUs(80, zoom)));
  }, [playing, playheadUs, scrollUs, zoom, viewportPx]);

  // --- Gestures ---------------------------------------------------------------------------------
  const envFor = (points: number[]): GestureEnv => ({
    composition,
    snapPoints: points,
    thresholdUs: pxToUs(SNAP_PX, zoom),
    snapping,
    fps: composition.fps,
    newId: props.newId,
  });

  const laneAt = (clientY: number): string | undefined => {
    for (const [id, el] of laneRefs.current) {
      const r = el.getBoundingClientRect();
      if (clientY >= r.top && clientY < r.bottom) return id;
    }
    return undefined;
  };

  function compute(d: Drag, clientX: number, clientY: number): { result: GestureResult | null; preview: Preview | null } {
    const p = live.current;
    const deltaUs = pxToUs(clientX - d.startX, p.zoomPxPerSec);
    const env = envFor(d.points);
    const placed = findPlaced(p.composition, d.clipId);
    let result: GestureResult | null = null;
    if (placed !== undefined) {
      const edgeUs = d.edge === "start" ? placed.clip.startUs : endOf(placed.clip);
      if (d.kind === "move") result = moveGesture(env, { clipId: d.clipId, selectedIds: d.selectedIds, deltaUs, targetTrackId: laneAt(clientY) });
      else if (d.kind === "trim" && d.edge) result = trimGesture(env, { clipId: d.clipId, edge: d.edge, toUs: edgeUs + deltaUs, ripple: d.ripple === true });
      else if (d.kind === "roll" && d.rollLeft && d.rollRight) {
        const left = findPlaced(p.composition, d.rollLeft);
        if (left !== undefined) result = rollGesture(env, { leftClipId: d.rollLeft, rightClipId: d.rollRight, toUs: endOf(left.clip) + deltaUs });
      } else if (d.kind === "slip") result = slipGesture(env, { clipId: d.clipId, deltaUs });
      else if (d.kind === "slide") result = slideGesture(env, { clipId: d.clipId, deltaUs });
    }
    return { result, preview: result === null ? null : previewGesture(p.project, result.op) };
  }

  useEffect(() => {
    if (drag === null) return;
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (d === null) return;
      if (!d.moved && Math.abs(e.clientX - d.startX) < DRAG_THRESHOLD_PX && Math.abs(e.clientY - d.startY) < DRAG_THRESHOLD_PX) return;
      const next: Drag = { ...d, moved: true, ...compute(d, e.clientX, e.clientY) };
      dragRef.current = next;
      setDrag(next);
    };
    const finish = (commit: boolean) => {
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (commit && d?.moved && d.result !== null && d.preview?.error === null) live.current.onCommit(d.result.op, LABELS[d.kind]);
    };
    const up = () => {
      finish(true);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish(false);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", key);
    };
    // The listeners read the drag from the ref; they only need re-attaching when a drag starts or ends.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag === null]);

  function onClipPointerDown(e: React.PointerEvent, clip: Clip, zone: ClipZone) {
    const lane = (e.currentTarget as HTMLElement).closest("[data-lane]");
    const originLeft = lane?.getBoundingClientRect().left ?? 0;
    const timeAt = pxToUs(e.clientX - originLeft, zoom);

    if (tool === "razor") {
      const points = snapPoints(composition, { excludeClipIds: [clip.id], playheadUs });
      const r = razorGesture(envFor(points), { clipId: clip.id, atUs: timeAt });
      if (r !== null) props.onCommit(r.op, LABELS.razor);
      return;
    }

    // Selection: click selects the clip and whatever is linked to it (Alt: just the clip); Shift/Ctrl toggles.
    const modifier = e.shiftKey || e.ctrlKey || e.metaKey;
    const group = e.altKey ? [clip.id] : withLinked(composition, [clip.id]);
    let ids = [...selectedClipIds];
    if (modifier) ids = group.every((id) => ids.includes(id)) ? ids.filter((id) => !group.includes(id)) : [...new Set([...ids, ...group])];
    else if (!ids.includes(clip.id)) ids = group;
    if (ids.join() !== selectedClipIds.join()) props.onSelectClips(ids);
    if (!ids.includes(clip.id)) return;

    let kind: GestureKind | null = null;
    let edge: "start" | "end" | undefined;
    let rollLeft: string | undefined;
    let rollRight: string | undefined;
    if (tool === "select") {
      if (zone === "body") kind = "move";
      else {
        kind = "trim";
        edge = zone;
      }
    } else if (tool === "ripple" && zone !== "body") {
      kind = "trim";
      edge = zone;
    } else if (tool === "roll" && zone !== "body") {
      const neighbour = adjacent(composition, clip, zone);
      if (neighbour !== undefined) {
        kind = "roll";
        edge = zone;
        [rollLeft, rollRight] = zone === "end" ? [clip.id, neighbour.id] : [neighbour.id, clip.id];
      }
    } else if (tool === "slip" && zone === "body") kind = "slip";
    else if (tool === "slide" && zone === "body") kind = "slide";
    if (kind === null) return;

    const next: Drag = {
      kind,
      clipId: clip.id,
      ...(edge === undefined ? {} : { edge }),
      ...(tool === "ripple" ? { ripple: true } : {}),
      ...(rollLeft === undefined ? {} : { rollLeft }),
      ...(rollRight === undefined ? {} : { rollRight }),
      startX: e.clientX,
      startY: e.clientY,
      originLeft,
      moved: false,
      points: snapPoints(composition, { excludeClipIds: snapExclusions(composition, kind, clip.id, ids), playheadUs }),
      selectedIds: ids,
      result: null,
      preview: null,
    };
    dragRef.current = next;
    setDrag(next);
  }

  // --- Drawing ----------------------------------------------------------------------------------
  const shown = useMemo(() => {
    const after = drag?.preview?.project;
    return after?.compositions.find((c) => c.id === composition.id) ?? composition;
  }, [drag, composition]);
  const invalid = useMemo(
    () => (drag?.preview?.error ? new Set(snapExclusions(composition, drag.kind, drag.clipId, drag.selectedIds)) : new Set<string>()),
    [drag, composition],
  );
  const contentPx = usToPx(Math.max(shown.durationUs + TAIL_US, pxToUs(viewportPx, zoom)), zoom);
  const rows = [...shown.tracks].reverse(); // the last track composites on top, so it is drawn on top
  const fps = shown.fps;

  return (
    <div className="relative flex h-full min-h-0 flex-col" data-testid="timeline" data-tool={tool}>
      {drag?.preview?.error && (
        <p role="status" data-testid="drag-error" className="absolute right-3 top-8 z-40 rounded bg-red-950 px-2 py-1 text-xs text-red-200 shadow">
          {drag.preview.error.message}
        </p>
      )}
      <div
        ref={scroller}
        className="relative min-h-0 flex-1 overflow-auto"
        onScroll={(e) => {
          props.onScroll(pxToUs(e.currentTarget.scrollLeft, live.current.zoomPxPerSec));
        }}
      >
        <div className="relative" style={{ width: HEADER_WIDTH + contentPx, minWidth: "100%" }}>
          <div className="sticky top-0 z-30 flex">
            <div className="sticky left-0 z-40 border-b border-r border-neutral-700 bg-neutral-900" style={{ width: HEADER_WIDTH, height: RULER_HEIGHT }} />
            <Ruler
              composition={shown}
              fps={fps}
              zoomPxPerSec={zoom}
              scrollUs={scrollUs}
              viewportPx={viewportPx}
              widthPx={contentPx}
              onSeek={props.onSeek}
              onCommit={props.onCommit}
            />
          </div>

          {rows.length === 0 && <p className="p-4 text-sm text-neutral-500">This composition has no tracks. Add one from the command palette.</p>}
          {rows.map((track) => (
            <div key={track.id} className="flex">
              <div className="sticky left-0 z-20 border-r border-neutral-700">
                <TrackHeader
                  track={track}
                  selected={track.id === selectedTrackId}
                  ctx={props.ctx}
                  onSelect={() => {
                    props.onSelectTrack(track.id === selectedTrackId ? null : track.id);
                  }}
                  onRun={props.onRunAction}
                />
              </div>
              <div
                data-lane={track.id}
                data-testid="lane"
                ref={(el) => {
                  if (el === null) laneRefs.current.delete(track.id);
                  else laneRefs.current.set(track.id, el);
                }}
                className={`relative border-b border-neutral-800 ${track.kind === "audio" ? "bg-neutral-950" : "bg-neutral-900/60"} ${track.hidden || track.muted ? "opacity-60" : ""}`}
                style={{ width: contentPx, height: LANE_HEIGHT }}
                onPointerDown={(e) => {
                  if (e.button !== 0 || e.target !== e.currentTarget) return;
                  props.onSelectClips([]);
                  props.onSelectTrack(track.id);
                }}
              >
                {track.clips.map((clip) => (
                  <ClipView
                    key={clip.id}
                    clip={clip}
                    asset={project.assets.find((a) => a.id === clip.assetId)}
                    zoomPxPerSec={zoom}
                    selected={selectedClipIds.includes(clip.id)}
                    invalid={invalid.has(clip.id)}
                    cursor={CURSORS[tool]}
                    onPointerDown={onClipPointerDown}
                  />
                ))}
              </div>
            </div>
          ))}

          {drag?.result?.snappedTo !== null && drag?.result?.snappedTo !== undefined && (
            <div
              data-testid="snap-line"
              className="pointer-events-none absolute bottom-0 z-30 w-px bg-amber-400"
              style={{ left: HEADER_WIDTH + usToPx(drag.result.snappedTo, zoom), top: RULER_HEIGHT }}
            />
          )}
          <div
            data-testid="playhead"
            className="pointer-events-none absolute bottom-0 top-0 z-30 w-px bg-red-500"
            style={{ left: HEADER_WIDTH + usToPx(playheadUs, zoom) }}
          >
            <div className="absolute -left-1.5 top-0 h-3 w-3 rounded-b bg-red-500" />
          </div>
        </div>
      </div>
    </div>
  );
}
