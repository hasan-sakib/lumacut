import { sampleCurve } from "@lumacut/engine/color";
import type { Vec2 } from "@lumacut/schema";
import { useEffect, useRef, useState } from "react";
import {
  CURVE_INFO,
  addPoint,
  movePoint,
  removePoint,
  type CurveName,
} from "../../color/curve-model.ts";

const SIZE = 200;
const PAD = 10;
const INNER = SIZE - 2 * PAD;

interface CurveEditorProps {
  name: CurveName;
  points: readonly Vec2[];
  /** The new points; drags of one point share `coalesceKey` (one undo step). */
  onChange: (points: Vec2[], coalesceKey: string) => void;
}

const toPx = (x: number, y: number): [number, number] => [PAD + x * INNER, PAD + (1 - y) * INNER];

/**
 * Edits one curve: click empty space to add a point, drag a point to move it, double-click an
 * inner point to remove it. The curve drawn is the same monotone cubic the grade uses.
 */
export function CurveEditor({ name, points, onChange }: CurveEditorProps) {
  const svg = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const latest = useRef({ points, onChange, name });
  useEffect(() => {
    latest.current = { points, onChange, name };
  });

  const fromEvent = (clientX: number, clientY: number): [number, number] => {
    const box = svg.current?.getBoundingClientRect();
    const w = box !== undefined && box.width > 0 ? box.width : SIZE;
    const h = box !== undefined && box.height > 0 ? box.height : SIZE;
    const px = ((clientX - (box?.left ?? 0)) * SIZE) / w;
    const py = ((clientY - (box?.top ?? 0)) * SIZE) / h;
    return [(px - PAD) / INNER, 1 - (py - PAD) / INNER];
  };

  useEffect(() => {
    if (drag === null) return;
    const move = (e: PointerEvent) => {
      const { points: current, onChange: change, name: curve } = latest.current;
      const [x, y] = fromEvent(e.clientX, e.clientY);
      change(movePoint(current, drag, x, y), `curve:${curve}:${String(drag)}`);
    };
    const up = () => {
      setDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [drag]);

  const flat = CURVE_INFO[name].flat;
  const table = sampleCurve(points);
  const line = Array.from(table, (v, i) => {
    const [px, py] = toPx(i / (table.length - 1), v);
    return `${String(px)},${String(py)}`;
  }).join(" ");
  const [lx0, ly0] = toPx(0, flat ? 0.5 : 0);
  const [lx1, ly1] = toPx(1, flat ? 0.5 : 1);

  return (
    <svg
      ref={svg}
      role="img"
      aria-label={`${CURVE_INFO[name].label} curve`}
      data-testid={`curve-${name}`}
      viewBox={`0 0 ${String(SIZE)} ${String(SIZE)}`}
      className="aspect-square w-full max-w-56 touch-none rounded border border-neutral-800 bg-neutral-950"
      onPointerDown={(e) => {
        if (e.target !== e.currentTarget) return;
        const [x, y] = fromEvent(e.clientX, e.clientY);
        const added = addPoint(points, x, y);
        onChange(added.points, `curve:${name}:${String(added.index)}`);
        setDrag(added.index);
      }}
    >
      {[0.25, 0.5, 0.75].map((f) => (
        <g key={f} stroke="#262626">
          <line x1={toPx(f, 0)[0]} y1={PAD} x2={toPx(f, 0)[0]} y2={SIZE - PAD} />
          <line x1={PAD} y1={toPx(0, f)[1]} x2={SIZE - PAD} y2={toPx(0, f)[1]} />
        </g>
      ))}
      <line x1={lx0} y1={ly0} x2={lx1} y2={ly1} stroke="#525252" strokeDasharray="4 4" />
      <polyline
        data-testid="curve-line"
        points={line}
        fill="none"
        stroke="#38bdf8"
        strokeWidth="2"
      />
      {points.map(([x, y], i) => {
        const [px, py] = toPx(x, y);
        return (
          <circle
            key={i}
            data-curve-point={i}
            cx={px}
            cy={py}
            r={5}
            fill={drag === i ? "#38bdf8" : "#e5e5e5"}
            stroke="#0c4a6e"
            className="cursor-grab"
            onPointerDown={(e) => {
              e.stopPropagation();
              setDrag(i);
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onChange(removePoint(points, i), `curve:${name}:remove`);
            }}
          />
        );
      })}
    </svg>
  );
}
