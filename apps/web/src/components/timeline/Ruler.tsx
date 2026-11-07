import type { Composition, Marker, Op, Rational } from "@lumacut/schema";
import { useEffect, useRef, useState } from "react";
import { formatTimecode } from "../../engine/transport.ts";
import { pxToUs, roundToFrame, rulerTicks, usToPx } from "../../timeline/geometry.ts";
import { RULER_HEIGHT } from "./layout.ts";

interface RulerProps {
  composition: Composition;
  fps: Rational;
  zoomPxPerSec: number;
  scrollUs: number;
  viewportPx: number;
  widthPx: number;
  /** Click or drag on the ruler to move the playhead. */
  onSeek: (us: number) => void;
  /** A marker was dragged to a new time. */
  onCommit: (op: Op, label: string) => void;
}

/** Time ruler: labelled ticks, markers you can drag, and scrubbing by pressing on it. */
export function Ruler({
  composition,
  fps,
  zoomPxPerSec,
  scrollUs,
  viewportPx,
  widthPx,
  onSeek,
  onCommit,
}: RulerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const [markerDrag, setMarkerDragState] = useState<{ id: string; tUs: number } | null>(null);
  // The pointer-up handler must see the latest position, not the one from when it was attached.
  const markerDragRef = useRef<{ id: string; tUs: number } | null>(null);
  const setMarkerDrag = (next: { id: string; tUs: number } | null) => {
    markerDragRef.current = next;
    setMarkerDragState(next);
  };
  const live = useRef({ onSeek, zoomPxPerSec, fps });
  useEffect(() => {
    live.current = { onSeek, zoomPxPerSec, fps };
  });

  const timeAt = (clientX: number): number => {
    const left = ref.current?.getBoundingClientRect().left ?? 0;
    return roundToFrame(
      Math.max(0, pxToUs(clientX - left, live.current.zoomPxPerSec)),
      live.current.fps,
    );
  };

  // Scrubbing and marker dragging follow the pointer wherever it goes.
  useEffect(() => {
    if (!scrubbing && markerDrag === null) return;
    const move = (e: PointerEvent) => {
      const t = timeAt(e.clientX);
      const current = markerDragRef.current;
      if (scrubbing) live.current.onSeek(t);
      else if (current !== null) setMarkerDrag({ ...current, tUs: t });
    };
    const up = () => {
      const dragged = markerDragRef.current;
      if (dragged !== null) {
        const marker = composition.markers.find((m) => m.id === dragged.id);
        if (marker !== undefined && marker.tUs !== dragged.tUs) {
          const moved: Marker = { ...marker, tUs: dragged.tUs };
          onCommit(
            { type: "updateMarker", compositionId: composition.id, marker: moved },
            "Move marker",
          );
        }
      }
      setScrubbing(false);
      setMarkerDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrubbing, markerDrag?.id]);

  const ticks = rulerTicks(scrollUs, Math.max(viewportPx, 400) + 200, zoomPxPerSec);
  return (
    <div
      ref={ref}
      data-testid="ruler"
      className="relative cursor-pointer select-none border-b border-neutral-700 bg-neutral-900"
      style={{ width: widthPx, height: RULER_HEIGHT }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        onSeek(timeAt(e.clientX));
        setScrubbing(true);
      }}
    >
      {ticks.map((t) => (
        <div
          key={t.us}
          className="absolute top-0 border-l border-neutral-600"
          style={{
            left: usToPx(t.us, zoomPxPerSec),
            height: t.major ? RULER_HEIGHT : RULER_HEIGHT / 3,
          }}
        >
          {t.major && (
            <span className="absolute left-1 top-0.5 whitespace-nowrap text-[10px] text-neutral-400">
              {formatTimecode(t.us, fps)}
            </span>
          )}
        </div>
      ))}
      {composition.markers.map((m) => {
        const at = markerDrag?.id === m.id ? markerDrag.tUs : m.tUs;
        return (
          <button
            key={m.id}
            type="button"
            data-marker={m.id}
            title={m.label === "" ? "Marker" : m.label}
            aria-label={`Marker${m.label === "" ? "" : ` ${m.label}`} at ${formatTimecode(at, fps)}`}
            className="absolute bottom-0 -ml-1.5 h-3 w-3 cursor-grab rounded-sm"
            style={{
              left: usToPx(at, zoomPxPerSec),
              backgroundColor: `rgb(${String(m.color.r * 255)} ${String(m.color.g * 255)} ${String(m.color.b * 255)})`,
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              if (e.button !== 0) return;
              setMarkerDrag({ id: m.id, tUs: m.tUs });
            }}
          />
        );
      })}
    </div>
  );
}
