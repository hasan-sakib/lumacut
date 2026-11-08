import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { dragCrop, type CropHandle } from "../../photo/crop.ts";
import {
  ellipseSelection,
  isUsable,
  lassoSelection,
  rectSelection,
} from "../../photo/selection.ts";
import type { BrushSettings, Selection } from "../../photo/types.ts";
import { svgPath } from "../../overlay/path-edit.ts";
import { clientToComp, screenScale, type Point } from "../../overlay/viewport.ts";
import type { CropBox } from "../../stores/photo.ts";
import type { CanvasTool } from "../../stores/editor.ts";

interface PhotoOverlayProps {
  canvas: { width: number; height: number };
  canvasTool: CanvasTool;
  brush: BrushSettings;
  selection: Selection | null;
  /** What part of the canvas the SVG shows ("x y width height", canvas pixels). */
  viewBox: string;
  crop: CropBox | null;
  cropAspect: number | null;
  straighten: number;
  /** Does the mask brush reveal ("reveal") or hide? Alt flips it for one stroke. */
  maskMode: "reveal" | "hide";
  /** A layer is selected for the mask brush. */
  canMask: boolean;
  onSelection: (selection: Selection | null) => void;
  onCrop: (box: CropBox) => void;
  /** A finished brush or eraser stroke: x, y, pressure triples in canvas pixels. */
  onStroke: (tool: "brush" | "eraser", points: number[]) => void;
  onMaskStroke: (points: number[], hide: boolean) => void;
}

const HANDLES: { id: CropHandle; x: number; y: number; cursor: string }[] = [
  { id: "nw", x: 0, y: 0, cursor: "nwse-resize" },
  { id: "n", x: 0.5, y: 0, cursor: "ns-resize" },
  { id: "ne", x: 1, y: 0, cursor: "nesw-resize" },
  { id: "e", x: 1, y: 0.5, cursor: "ew-resize" },
  { id: "se", x: 1, y: 1, cursor: "nwse-resize" },
  { id: "s", x: 0.5, y: 1, cursor: "ns-resize" },
  { id: "sw", x: 0, y: 1, cursor: "nesw-resize" },
  { id: "w", x: 0, y: 0.5, cursor: "ew-resize" },
];

type Draft =
  | { kind: "marquee"; shape: "rect" | "ellipse"; a: Point; b: Point }
  | { kind: "lasso"; points: Point[] }
  | { kind: "stroke"; tool: "brush" | "eraser" | "mask"; hide: boolean; points: number[] }
  | { kind: "crop"; handle: CropHandle; start: Point; box: CropBox };

const MARQUEE_TOOLS = new Set<CanvasTool>(["marqueeRect", "marqueeEllipse", "lasso"]);
const PAINT_TOOLS = new Set<CanvasTool>(["brush", "eraser", "maskBrush"]);

function pressureOf(e: { pointerType: string; pressure: number }): number {
  if (e.pointerType === "mouse") return 1;
  return e.pressure > 0 ? e.pressure : 0.5;
}

/**
 * What the photo tools draw and do on top of the canvas picture: marquee and lasso selections
 * (with marching ants), the crop box and its grid, and brush, eraser and mask-brush strokes. It is
 * an SVG in canvas pixels, shifted to the visible window by `viewBox`; every result goes out
 * through the callbacks (which run registry actions).
 */
export function PhotoOverlay(props: PhotoOverlayProps) {
  const { canvas, canvasTool, brush, selection, crop, cropAspect, straighten } = props;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const draftRef = useRef<Draft | null>(null);
  const [hover, setHover] = useState<Point | null>(null);
  const [unit, setUnit] = useState(1); // canvas pixels per screen pixel

  const set = useCallback((next: Draft | null) => {
    draftRef.current = next;
    setDraft(next);
  }, []);

  useLayoutEffect(() => {
    const el = svgRef.current;
    if (el === null) return;
    setUnit(1 / screenScale(el));
  }, [props.viewBox]);

  const point = useCallback((e: { clientX: number; clientY: number }): Point | null => {
    const el = svgRef.current;
    return el === null ? null : clientToComp(el, e.clientX, e.clientY);
  }, []);

  const active =
    MARQUEE_TOOLS.has(canvasTool) || PAINT_TOOLS.has(canvasTool) || canvasTool === "crop";

  function onDown(e: React.PointerEvent<SVGSVGElement>) {
    if (!active || e.button !== 0) return;
    const p = point(e);
    if (p === null) return;
    if (canvasTool === "crop") return; // crop drags start on the box's own handles
    e.currentTarget.setPointerCapture(e.pointerId);
    if (canvasTool === "marqueeRect" || canvasTool === "marqueeEllipse") {
      set({
        kind: "marquee",
        shape: canvasTool === "marqueeRect" ? "rect" : "ellipse",
        a: p,
        b: p,
      });
    } else if (canvasTool === "lasso") {
      set({ kind: "lasso", points: [p] });
    } else if (canvasTool === "maskBrush" && !props.canMask) {
      // Nothing to paint on: select a layer first (the toolbar says so).
    } else {
      const tool = canvasTool === "maskBrush" ? "mask" : (canvasTool as "brush" | "eraser");
      const hide = (props.maskMode === "hide") !== e.altKey;
      set({ kind: "stroke", tool, hide, points: [p.x, p.y, pressureOf(e)] });
    }
  }

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const p = point(e);
    if (p === null) return;
    const current = draftRef.current;
    if (current === null) {
      if (PAINT_TOOLS.has(canvasTool)) setHover(p);
      return;
    }
    if (current.kind === "marquee") {
      set({ ...current, b: p });
    } else if (current.kind === "lasso") {
      set({ ...current, points: [...current.points, p] });
    } else if (current.kind === "stroke") {
      const points = [...current.points];
      // Browsers differ on coalesced events (the in-between pointer positions of a fast stroke).
      const native: { getCoalescedEvents?: () => PointerEvent[] } = e.nativeEvent;
      const events = native.getCoalescedEvents?.() ?? [];
      const batch = events.length > 0 ? events : [e.nativeEvent];
      const gap = Math.max(0.5, brush.size * 0.04);
      for (const ev of batch) {
        const q = point(ev);
        if (q === null) continue;
        const lx = points[points.length - 3] ?? q.x;
        const ly = points[points.length - 2] ?? q.y;
        if (Math.hypot(q.x - lx, q.y - ly) >= gap) points.push(q.x, q.y, pressureOf(ev));
      }
      set({ ...current, points });
      setHover(p);
    } else {
      const next = dragCrop(
        current.box,
        current.handle,
        p.x - current.start.x,
        p.y - current.start.y,
        canvas,
        cropAspect,
      );
      props.onCrop(next);
    }
  }

  function onUp(e: React.PointerEvent<SVGSVGElement>) {
    const current = draftRef.current;
    set(null);
    if (current === null) return;
    const p = point(e);
    if (current.kind === "marquee") {
      const end = p ?? current.b;
      const path =
        current.shape === "rect" ? rectSelection(current.a, end) : ellipseSelection(current.a, end);
      props.onSelection(
        isUsable(path) ? { path, feather: selection?.feather ?? 0, inverted: false } : null, // a click clears the selection
      );
    } else if (current.kind === "lasso") {
      const path = lassoSelection(current.points);
      props.onSelection(
        path !== null && isUsable(path)
          ? { path, feather: selection?.feather ?? 0, inverted: false }
          : null,
      );
    } else if (current.kind === "stroke") {
      const points = [...current.points];
      if (p !== null && points.length >= 3) points.push(p.x, p.y, points[points.length - 1] ?? 1);
      if (points.length < 3) return;
      if (current.tool === "mask") props.onMaskStroke(points, current.hide);
      else props.onStroke(current.tool, points);
    }
  }

  const r = 5 * unit;
  const stroke = 1.5 * unit;
  const cursor = canvasTool === "crop" ? "default" : active ? "crosshair" : "default";

  // --- Selection (marching ants) --------------------------------------------------------------
  const outline = selection === null ? null : svgPath(selection.path);
  const ants =
    selection !== null && outline !== null ? (
      <g data-testid="selection-ants" pointerEvents="none" fill="none">
        {selection.inverted && (
          <path
            d={`M0 0H${String(canvas.width)}V${String(canvas.height)}H0Z`}
            stroke="#000"
            strokeWidth={stroke}
          />
        )}
        <path d={outline} stroke="#fff" strokeWidth={stroke} />
        <path
          d={outline}
          stroke="#000"
          strokeWidth={stroke}
          strokeDasharray={`${String(4 * unit)} ${String(4 * unit)}`}
        >
          <animate
            attributeName="stroke-dashoffset"
            from="0"
            to={String(8 * unit)}
            dur="0.6s"
            repeatCount="indefinite"
          />
        </path>
      </g>
    ) : null;

  // --- Drafts ---------------------------------------------------------------------------------
  let draftShape: React.ReactNode = null;
  if (draft?.kind === "marquee") {
    const path =
      draft.shape === "rect" ? rectSelection(draft.a, draft.b) : ellipseSelection(draft.a, draft.b);
    draftShape = (
      <path d={svgPath(path)} fill="rgba(56,189,248,0.12)" stroke="#38bdf8" strokeWidth={stroke} />
    );
  } else if (draft?.kind === "lasso") {
    draftShape = (
      <polyline
        points={draft.points.map((q) => `${String(q.x)},${String(q.y)}`).join(" ")}
        fill="rgba(56,189,248,0.12)"
        stroke="#38bdf8"
        strokeWidth={stroke}
      />
    );
  } else if (draft?.kind === "stroke") {
    const pts: string[] = [];
    for (let i = 0; i + 2 < draft.points.length; i += 3) {
      pts.push(`${String(draft.points[i])},${String(draft.points[i + 1])}`);
    }
    const colour =
      draft.tool === "mask"
        ? draft.hide
          ? "#f43f5e"
          : "#22c55e"
        : draft.tool === "eraser"
          ? "#e5e5e5"
          : `rgb(${String(Math.round(brush.color.r * 255))},${String(Math.round(brush.color.g * 255))},${String(Math.round(brush.color.b * 255))})`;
    draftShape = (
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={colour}
        strokeOpacity={draft.tool === "brush" ? brush.opacity : 0.55}
        strokeWidth={brush.size}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }

  // --- Brush cursor ---------------------------------------------------------------------------
  const brushCursor =
    PAINT_TOOLS.has(canvasTool) && hover !== null ? (
      <circle
        cx={hover.x}
        cy={hover.y}
        r={Math.max(brush.size / 2, 1 * unit)}
        fill="none"
        stroke="#fff"
        strokeWidth={stroke}
        pointerEvents="none"
        style={{ mixBlendMode: "difference" }}
      />
    ) : null;

  // --- Crop box -------------------------------------------------------------------------------
  let cropLayer: React.ReactNode = null;
  if (canvasTool === "crop" && crop !== null) {
    const { x, y, width: w, height: h } = crop;
    const lines: React.ReactNode[] = [];
    for (const f of [1 / 3, 2 / 3]) {
      lines.push(
        <line key={`v${String(f)}`} x1={x + w * f} y1={y} x2={x + w * f} y2={y + h} />,
        <line key={`h${String(f)}`} x1={x} y1={y + h * f} x2={x + w} y2={y + h * f} />,
      );
    }
    const tilt: React.ReactNode[] = [];
    if (straighten !== 0) {
      for (let i = 1; i < 12; i += 1) {
        const t = (i / 12) * canvas.height;
        tilt.push(
          <line key={`t${String(i)}`} x1={-canvas.width} y1={t} x2={canvas.width * 2} y2={t} />,
        );
      }
    }
    cropLayer = (
      <g data-testid="crop-box">
        <path
          d={`M0 0H${String(canvas.width)}V${String(canvas.height)}H0Z M${String(x)} ${String(y)}V${String(y + h)}H${String(x + w)}V${String(y)}Z`}
          fill="rgba(0,0,0,0.55)"
          fillRule="evenodd"
          pointerEvents="none"
        />
        <g stroke="rgba(255,255,255,0.6)" strokeWidth={unit} pointerEvents="none">
          {lines}
        </g>
        {straighten !== 0 && (
          <g
            stroke="rgba(56,189,248,0.7)"
            strokeWidth={unit}
            pointerEvents="none"
            transform={`rotate(${String(straighten)} ${String(canvas.width / 2)} ${String(canvas.height / 2)})`}
          >
            {tilt}
          </g>
        )}
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          fill="transparent"
          stroke="#fff"
          strokeWidth={stroke}
          style={{ cursor: "move" }}
          onPointerDown={(e) => {
            const p = point(e);
            if (p === null) return;
            e.stopPropagation();
            svgRef.current?.setPointerCapture(e.pointerId);
            set({ kind: "crop", handle: "move", start: p, box: crop });
          }}
        />
        {HANDLES.map((hd) => (
          <rect
            key={hd.id}
            x={x + w * hd.x - r}
            y={y + h * hd.y - r}
            width={2 * r}
            height={2 * r}
            fill="#fff"
            stroke="#0369a1"
            strokeWidth={stroke}
            style={{ cursor: hd.cursor }}
            onPointerDown={(e) => {
              const p = point(e);
              if (p === null) return;
              e.stopPropagation();
              svgRef.current?.setPointerCapture(e.pointerId);
              set({ kind: "crop", handle: hd.id, start: p, box: crop });
            }}
          />
        ))}
      </g>
    );
  }

  return (
    <svg
      ref={svgRef}
      data-testid="photo-overlay"
      data-tool={canvasTool}
      viewBox={props.viewBox}
      preserveAspectRatio="none"
      className="absolute inset-0 h-full w-full touch-none"
      style={{ cursor, pointerEvents: active ? "auto" : "none" }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={() => {
        set(null);
      }}
      onPointerLeave={() => {
        if (draftRef.current === null) setHover(null);
      }}
    >
      <rect x={-1e7} y={-1e7} width={2e7} height={2e7} fill="transparent" />
      {ants}
      {cropLayer}
      {draftShape}
      {brushCursor}
    </svg>
  );
}
