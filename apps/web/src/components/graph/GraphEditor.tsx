import {
  EASE_PRESETS,
  EASE_PRESET_INFO,
  easePresetOps,
  endOf,
  type EasePreset,
} from "@lumacut/ops";
import type { Clip, Keyframe, Op } from "@lumacut/schema";
import { useEffect, useMemo, useRef, useState } from "react";
import { removeKeyframeOps } from "../../inspector/animation.ts";
import {
  CHANNEL_NAMES,
  curvesOf,
  easeFromInto,
  easeFromOut,
  makePlot,
  movedKeyframe,
  paddedRange,
  sampleChannels,
  segmentHandles,
  speedSamples,
  type GraphMode,
  type Plot,
  type PropertyCurve,
} from "../../graph/model.ts";

export const GRAPH_WIDTH = 720;
export const GRAPH_HEIGHT = 240;
const CHANNEL_COLORS = ["#38bdf8", "#f472b6", "#a3e635", "#fbbf24"];

interface GraphEditorProps {
  /** The clip whose animation is shown (the single selected clip), or undefined. */
  clip: Clip | undefined;
  /** Timeline time of the playhead. */
  playheadUs: number;
  /** Apply a change; drags of one keyframe or handle share `coalesceKey` (one undo step). */
  onChange: (op: Op, coalesceKey: string | undefined) => void;
  onSeek: (us: number) => void;
}

type DragTarget =
  | { kind: "key"; path: string; index: number }
  | { kind: "out" | "into"; path: string; index: number };

const seconds = (us: number): string => (us / 1_000_000).toFixed(2);

/**
 * The graph editor: pick an animated property, then see it as a value curve or a speed curve.
 * Drag a keyframe to move it (in time, and in value for numbers), drag its handles to shape the
 * ease (After Effects influence and speed), or apply a preset. Every change is an op.
 */
export function GraphEditor({ clip, playheadUs, onChange, onSeek }: GraphEditorProps) {
  const curves = useMemo(() => (clip === undefined ? [] : curvesOf(clip)), [clip]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [mode, setMode] = useState<GraphMode>("value");
  const [selected, setSelected] = useState<number | null>(null);
  const [drag, setDrag] = useState<DragTarget | null>(null);
  /** The scale at the start of a drag, so the graph doesn't rescale under the pointer. */
  const [frozen, setFrozen] = useState<Plot | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const curve: PropertyCurve | undefined = curves.find((c) => c.path === chosen) ?? curves[0];
  const latest = useRef({ clip, curve, mode, onChange });
  useEffect(() => {
    latest.current = { clip, curve, mode, onChange };
  });

  const lengthUs = clip === undefined ? 1 : endOf(clip) - clip.startUs;
  const frames: readonly Keyframe[] = useMemo(() => curve?.frames ?? [], [curve]);
  const numberValue = curve?.kind === "number";

  const livePlot = useMemo(() => {
    const ys: number[] = [];
    if (mode === "speed") {
      for (const p of speedSamples(frames)) ys.push(p.speed);
      ys.push(0);
      frames.forEach((k, i) => {
        const next = frames[i + 1];
        if (next !== undefined && k.interpolation === "bezier") {
          const h = segmentHandles(k, next, "speed");
          ys.push(h.out.y, h.into.y);
        }
      });
    } else {
      for (const s of sampleChannels(frames, lengthUs, 96)) ys.push(...s.values);
      if (numberValue) {
        frames.forEach((k, i) => {
          const next = frames[i + 1];
          if (next !== undefined && k.interpolation === "bezier") {
            const h = segmentHandles(k, next, "value");
            ys.push(h.out.y, h.into.y);
          }
        });
      }
    }
    return makePlot(GRAPH_WIDTH, GRAPH_HEIGHT, lengthUs, paddedRange(ys));
  }, [frames, lengthUs, mode, numberValue]);
  const plot = frozen ?? livePlot;
  const startDrag = (target: DragTarget) => {
    setFrozen(livePlot);
    setDrag(target);
  };

  // Pointer → graph coordinates (the SVG is stretched to its box).
  const toGraph = (clientX: number, clientY: number): { px: number; py: number } => {
    const box = svgRef.current?.getBoundingClientRect();
    const w = box !== undefined && box.width > 0 ? box.width : GRAPH_WIDTH;
    const h = box !== undefined && box.height > 0 ? box.height : GRAPH_HEIGHT;
    return {
      px: ((clientX - (box?.left ?? 0)) * GRAPH_WIDTH) / w,
      py: ((clientY - (box?.top ?? 0)) * GRAPH_HEIGHT) / h,
    };
  };

  useEffect(() => {
    if (drag === null) return;
    const move = (e: PointerEvent) => {
      const { clip: c, curve: cv, mode: m, onChange: change } = latest.current;
      if (c === undefined || cv === undefined) return;
      const list = c.keyframes[drag.path] ?? [];
      const k = list[drag.index];
      if (k === undefined) return;
      const { px, py } = toGraph(e.clientX, e.clientY);
      const tUs = plot.tAt(px);
      const y = plot.valueAt(py);
      const coalesceKey = `graph:${c.id}:${drag.path}:${String(drag.index)}:${drag.kind}`;
      if (drag.kind === "key") {
        const moved = movedKeyframe(
          list,
          drag.index,
          endOf(c) - c.startUs,
          tUs,
          m === "value" ? y : undefined,
        );
        if (moved !== null && (moved.tUs !== k.tUs || moved.value !== k.value)) {
          change(
            { type: "updateKeyframe", clipId: c.id, path: drag.path, tUs: k.tUs, keyframe: moved },
            coalesceKey,
          );
        }
        return;
      }
      const other = drag.kind === "out" ? list[drag.index + 1] : list[drag.index - 1];
      if (other === undefined) return;
      const [k0, k1] = drag.kind === "out" ? [k, other] : [other, k];
      const ease =
        drag.kind === "out" ? easeFromOut(k0, k1, m, tUs, y) : easeFromInto(k0, k1, m, tUs, y);
      const target = drag.kind === "out" ? k0 : k1;
      const patch: Keyframe =
        drag.kind === "out"
          ? { ...target, interpolation: "bezier", easeOut: ease }
          : { ...target, easeIn: ease };
      change(
        { type: "updateKeyframe", clipId: c.id, path: drag.path, tUs: target.tUs, keyframe: patch },
        coalesceKey,
      );
    };
    const up = () => {
      setDrag(null);
      setFrozen(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [drag, plot]);

  if (clip === undefined) {
    return (
      <div aria-label="Graph editor" className="p-4 text-sm text-neutral-400">
        Select a clip with keyframes to edit its curves here.
      </div>
    );
  }
  if (curve === undefined) {
    return (
      <div aria-label="Graph editor" className="p-4 text-sm text-neutral-400">
        This clip has no keyframes yet. Click the ◆ next to a property in the Inspector to start
        animating it.
      </div>
    );
  }

  const picked = selected === null ? undefined : frames[selected];
  const channelNames = CHANNEL_NAMES[curve.kind];
  const apply = (ops: Op[], label: string) => {
    const only = ops[0];
    if (ops.length === 0) return;
    onChange(
      ops.length === 1 && only !== undefined ? only : { type: "batch", label, ops },
      undefined,
    );
  };

  return (
    <div aria-label="Graph editor" className="flex h-full min-h-0 gap-3 p-2 text-xs">
      <ul aria-label="Animated properties" className="w-36 shrink-0 space-y-1 overflow-y-auto">
        {curves.map((c) => (
          <li key={c.path}>
            <button
              type="button"
              aria-pressed={c.path === curve.path}
              onMouseDown={(e) => {
                e.preventDefault();
              }}
              onClick={() => {
                setChosen(c.path);
                setSelected(null);
              }}
              className={`w-full truncate rounded px-2 py-1 text-left ${c.path === curve.path ? "bg-sky-900 text-sky-100" : "text-neutral-300 hover:bg-neutral-800"}`}
            >
              {c.label}
            </button>
          </li>
        ))}
      </ul>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {(["value", "speed"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              title={
                m === "value"
                  ? "Value graph: the property's value over time."
                  : "Speed graph: how fast the property changes. Drag handles to set ease influence (sideways) and speed (up/down)."
              }
              onMouseDown={(e) => {
                e.preventDefault();
              }}
              onClick={() => {
                setMode(m);
              }}
              className={`rounded px-2 py-1 ${mode === m ? "bg-sky-700 text-white" : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"}`}
            >
              {m === "value" ? "Value graph" : "Speed graph"}
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-neutral-700" />
          {EASE_PRESETS.map((preset: EasePreset) => (
            <button
              key={preset}
              type="button"
              disabled={picked === undefined}
              title={`${EASE_PRESET_INFO[preset].title}: ${EASE_PRESET_INFO[preset].description}${picked === undefined ? " (select a keyframe first)" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
              }}
              onClick={() => {
                if (selected === null) return;
                apply(
                  easePresetOps(clip, curve.path, selected, preset),
                  EASE_PRESET_INFO[preset].title,
                );
              }}
              className="rounded bg-neutral-800 px-2 py-1 text-neutral-200 hover:bg-neutral-700 disabled:opacity-40"
            >
              {EASE_PRESET_INFO[preset].title}
            </button>
          ))}
          <button
            type="button"
            disabled={picked === undefined}
            title="Remove the selected keyframe."
            onMouseDown={(e) => {
              e.preventDefault();
            }}
            onClick={() => {
              if (picked === undefined) return;
              apply(removeKeyframeOps(clip, curve.path, picked.tUs), "Remove keyframe");
              setSelected(null);
            }}
            className="ml-auto rounded bg-neutral-800 px-2 py-1 text-red-300 hover:bg-neutral-700 disabled:opacity-40"
          >
            Remove keyframe
          </button>
        </div>

        <svg
          ref={svgRef}
          data-testid="graph-svg"
          viewBox={`0 0 ${String(GRAPH_WIDTH)} ${String(GRAPH_HEIGHT)}`}
          preserveAspectRatio="none"
          className="min-h-0 w-full flex-1 rounded border border-neutral-800 bg-neutral-950"
          onPointerDown={(e) => {
            // Clicking empty graph moves the playhead there.
            if (e.target !== e.currentTarget) return;
            const { px } = toGraph(e.clientX, e.clientY);
            onSeek(clip.startUs + Math.max(0, Math.min(lengthUs, Math.round(plot.tAt(px)))));
            setSelected(null);
          }}
        >
          {[0.25, 0.5, 0.75].map((f) => (
            <line
              key={f}
              x1={plot.x(0)}
              x2={plot.x(lengthUs)}
              y1={plot.y(plot.valueAt(plot.height * f))}
              y2={plot.y(plot.valueAt(plot.height * f))}
              stroke="#262626"
            />
          ))}
          {mode === "speed" && (
            <line
              x1={plot.x(0)}
              x2={plot.x(lengthUs)}
              y1={plot.y(0)}
              y2={plot.y(0)}
              stroke="#525252"
            />
          )}
          {playheadUs >= clip.startUs && playheadUs <= endOf(clip) && (
            <line
              data-testid="graph-playhead"
              x1={plot.x(playheadUs - clip.startUs)}
              x2={plot.x(playheadUs - clip.startUs)}
              y1={0}
              y2={plot.height}
              stroke="#f87171"
            />
          )}

          {mode === "value" ? (
            channelNames.map((name, channel) => (
              <polyline
                key={name === "" ? "v" : name}
                data-testid="graph-curve"
                fill="none"
                stroke={CHANNEL_COLORS[channel % CHANNEL_COLORS.length]}
                strokeWidth="2"
                points={sampleChannels(frames, lengthUs, 160)
                  .map((s) => `${String(plot.x(s.tUs))},${String(plot.y(s.values[channel] ?? 0))}`)
                  .join(" ")}
              />
            ))
          ) : (
            <polyline
              data-testid="graph-curve"
              fill="none"
              stroke={CHANNEL_COLORS[0]}
              strokeWidth="2"
              points={speedSamples(frames)
                .map((s) => `${String(plot.x(s.tUs))},${String(plot.y(s.speed))}`)
                .join(" ")}
            />
          )}

          {selected !== null &&
            (() => {
              const k = frames[selected];
              if (k === undefined) return null;
              const handles: { kind: "out" | "into"; tUs: number; y: number; anchorY: number }[] =
                [];
              const next = frames[selected + 1];
              const previous = frames[selected - 1];
              // Handles in the value graph only make sense for numbers (ease is along a distance).
              if (mode === "speed" || numberValue) {
                if (next !== undefined && k.interpolation === "bezier") {
                  const h = segmentHandles(k, next, mode).out;
                  handles.push({
                    kind: "out",
                    ...h,
                    anchorY: mode === "value" && typeof k.value === "number" ? k.value : h.y,
                  });
                }
                if (previous?.interpolation === "bezier") {
                  const h = segmentHandles(previous, k, mode).into;
                  handles.push({
                    kind: "into",
                    ...h,
                    anchorY: mode === "value" && typeof k.value === "number" ? k.value : h.y,
                  });
                }
              }
              return handles.map((h) => (
                <g key={h.kind}>
                  <line
                    x1={plot.x(k.tUs)}
                    y1={plot.y(h.anchorY)}
                    x2={plot.x(h.tUs)}
                    y2={plot.y(h.y)}
                    stroke="#a3a3a3"
                    strokeDasharray="3 3"
                  />
                  <circle
                    data-graph-handle={h.kind}
                    cx={plot.x(h.tUs)}
                    cy={plot.y(h.y)}
                    r={6}
                    fill="#fbbf24"
                    stroke="#78350f"
                    className="cursor-grab"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      startDrag({ kind: h.kind, path: curve.path, index: selected });
                    }}
                  />
                </g>
              ));
            })()}

          {frames.map((k, i) => {
            const y =
              mode === "speed"
                ? (speedSamples(frames, 1).find((p) => p.tUs === k.tUs)?.speed ?? 0)
                : (channelValueOf(k) ?? 0);
            return (
              <rect
                key={k.tUs}
                data-graph-key={i}
                data-selected={selected === i}
                x={plot.x(k.tUs) - 5}
                y={plot.y(y) - 5}
                width={10}
                height={10}
                transform={`rotate(45 ${String(plot.x(k.tUs))} ${String(plot.y(y))})`}
                fill={selected === i ? "#38bdf8" : "#e5e5e5"}
                stroke="#0c4a6e"
                className="cursor-pointer"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setSelected(i);
                  startDrag({ kind: "key", path: curve.path, index: i });
                }}
              />
            );
          })}
        </svg>

        <p className="min-h-4 text-neutral-400" data-testid="graph-readout">
          {picked === undefined
            ? "Click a keyframe to select it, drag it to move it, drag its handles to ease."
            : `Keyframe at ${seconds(picked.tUs)} s · ${picked.interpolation}${picked.easeOut === undefined ? "" : ` · out ${picked.easeOut.influence.toFixed(0)}% @ ${picked.easeOut.speed.toFixed(2)}/s`}${picked.easeIn === undefined ? "" : ` · in ${picked.easeIn.influence.toFixed(0)}% @ ${picked.easeIn.speed.toFixed(2)}/s`}`}
        </p>
      </div>
    </div>
  );
}

/** Where a keyframe's dot sits vertically in the value graph (first channel: a number, or x / red). */
function channelValueOf(k: Keyframe): number | undefined {
  const v = k.value;
  if (typeof v === "number") return v;
  if (Array.isArray(v)) return v[0];
  if ("r" in v) return v.r;
  return 0;
}
