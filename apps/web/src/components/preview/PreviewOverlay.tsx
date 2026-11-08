import { animatedClip, endOf } from "@lumacut/ops";
import type { Clip, Composition, Keyframe, Op, Project, Vec2 } from "@lumacut/schema";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ClipInfo } from "../../inspector/fields.ts";
import { dragMove, dragRotate, dragScale } from "../../overlay/gizmo.ts";
import { apply, boxCorners, insideQuad, layerBoxOf, layerToComp } from "../../overlay/layer-box.ts";
import {
  POSITION_PATH,
  autoTangents,
  keyPoint,
  positionKeys,
  samplePositionPath,
} from "../../overlay/motion-path.ts";
import { editablePaths, type EditablePath } from "../../overlay/editable-paths.ts";
import {
  insertVertex,
  movePoint,
  nearestOnPath,
  removeVertex,
  setInTangent,
  setOutTangent,
  svgPath,
  toggleSmooth,
} from "../../overlay/path-edit.ts";
import {
  EMPTY_PEN,
  penDrag,
  penPath,
  penPress,
  penRelease,
  penUndo,
  type PenState,
} from "../../overlay/pen.ts";
import { moveOp, rotateOp, scaleOp } from "../../overlay/transform-ops.ts";
import { clientToComp, screenScale, type Point } from "../../overlay/viewport.ts";
import type { CanvasTool, PenMode } from "../../stores/editor.ts";

interface PreviewOverlayProps {
  project: Project;
  composition: Composition;
  /** The selected clips with their tracks. */
  selected: readonly ClipInfo[];
  playheadUs: number;
  canvasTool: CanvasTool;
  penMode: PenMode;
  /** Apply an edit; drags of one handle share `coalesceKey` (one undo step). */
  onCommit: (op: Op, coalesceKey: string | undefined) => void;
  /** Run a registry action (`shape.add`, `mask.addPath`…). */
  onRun: (id: string, args?: unknown) => void;
  onSelectClips: (ids: string[]) => void;
}

type Drag =
  | { kind: "move"; info: ClipInfo; start: Point; pos: Vec2 }
  | { kind: "scale"; info: ClipInfo; origin: Point; start: Point; scale: Vec2 }
  | { kind: "rotate"; info: ClipInfo; origin: Point; start: Point; rotation: number }
  | { kind: "vertex"; editable: EditablePath; index: number; path: EditablePath["path"] }
  | {
      kind: "tangent";
      editable: EditablePath;
      index: number;
      which: "in" | "out";
      path: EditablePath["path"];
    }
  | { kind: "key"; info: ClipInfo; key: Keyframe }
  | { kind: "keyTangent"; info: ClipInfo; key: Keyframe; which: "in" | "out" }
  | { kind: "draw"; tool: Exclude<CanvasTool, "select" | "pen">; start: Point; current: Point };

const SHAPE_TOOLS = new Set<CanvasTool>(["rect", "ellipse", "polygon", "star"]);

/**
 * Everything drawn and done on top of the preview picture: selecting and moving clips, the
 * transform gizmo (move, scale, rotate), editing the points of masks and drawn paths, the motion
 * path of animated positions, and the drawing tools (shapes and the pen). It is an SVG in
 * composition pixels, so what you see is what the engine renders; every change is an op.
 */
export function PreviewOverlay(props: PreviewOverlayProps) {
  const { project, composition, selected, playheadUs, canvasTool, penMode } = props;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const drag = useRef<Drag | null>(null);
  const [unit, setUnit] = useState(1); // composition pixels per screen pixel
  const [pen, setPen] = useState<PenState>(EMPTY_PEN);
  const [draft, setDraft] = useState<{ tool: string; a: Point; b: Point } | null>(null);
  const [vertex, setVertex] = useState<{ pathId: string; index: number } | null>(null);
  const [keyIndex, setKeyIndex] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = svgRef.current;
    if (el === null) return;
    const update = () => {
      setUnit(1 / screenScale(el));
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [composition.width, composition.height]);

  const single =
    selected.length === 1 && selected[0]?.track?.kind !== "audio" ? selected[0] : undefined;
  const local = single === undefined ? 0 : Math.max(0, playheadUs - single.clip.startUs);
  const geometry = useMemo(() => {
    if (single === undefined) return null;
    const animated: Clip = animatedClip(single.clip, local);
    const box = layerBoxOf(animated, project, composition, local);
    const m = layerToComp(animated, box);
    return { animated, box, m, corners: boxCorners(m, box) };
  }, [single, local, project, composition]);
  const paths = useMemo(
    () => (single === undefined ? [] : editablePaths(single, project, composition, playheadUs)),
    [single, project, composition, playheadUs],
  );

  const point = useCallback((e: { clientX: number; clientY: number }): Point | null => {
    const el = svgRef.current;
    return el === null ? null : clientToComp(el, e.clientX, e.clientY);
  }, []);

  // Keyboard: finish or cancel a pen path, delete the selected vertex.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (canvasTool === "pen" && pen.vertices.length > 0) {
        if (e.key === "Escape") {
          e.stopPropagation();
          setPen(EMPTY_PEN);
        } else if (e.key === "Enter") {
          e.stopPropagation();
          finishPen(false);
        } else if (e.key === "Backspace") {
          e.stopPropagation();
          e.preventDefault();
          setPen((s) => penUndo(s));
        }
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && vertex !== null) {
        const target = paths.find((p) => p.id === vertex.pathId);
        if (target === undefined) return;
        e.stopPropagation();
        e.preventDefault();
        const op = target.write(removeVertex(target.path, vertex.index));
        if (op !== null) props.onCommit(op, undefined);
        setVertex(null);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
    };
    // finishPen reads the latest pen state through the closure it is recreated with
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasTool, pen, vertex, paths]);

  function finishPen(closed: boolean): void {
    const path = penPath(pen, closed);
    setPen(EMPTY_PEN);
    if (path === null) return;
    if (penMode === "mask" && single !== undefined) props.onRun("mask.addPath", { path });
    else props.onRun("shape.addPath", { path });
  }

  /** The topmost clip under a point (visual, visible, on screen now). */
  function clipAt(p: Point): ClipInfo | undefined {
    let found: ClipInfo | undefined;
    composition.tracks.forEach((track) => {
      if (track.kind !== "visual" || track.hidden) return;
      for (const clip of track.clips) {
        if (playheadUs < clip.startUs || playheadUs >= endOf(clip)) continue;
        const t = Math.max(0, playheadUs - clip.startUs);
        const animated = animatedClip(clip, t);
        const box = layerBoxOf(animated, project, composition, t);
        if (insideQuad(boxCorners(layerToComp(animated, box), box), p)) {
          found = { clip, track, asset: project.assets.find((a) => a.id === clip.assetId) };
        }
      }
    });
    return found;
  }

  function begin(d: Drag, e: React.PointerEvent): void {
    e.stopPropagation();
    drag.current = d;
    svgRef.current?.setPointerCapture(e.pointerId);
  }

  const commit = (op: Op | null, key: string): void => {
    if (op !== null) props.onCommit(op, key);
  };

  function onMove(e: React.PointerEvent): void {
    const p = point(e);
    if (p === null) return;
    const d = drag.current;
    if (canvasTool === "pen" && pen.dragging) {
      setPen((s) => penDrag(s, [p.x, p.y]));
      return;
    }
    if (d === null) return;
    switch (d.kind) {
      case "move": {
        const next = dragMove({ x: d.pos[0], y: d.pos[1] }, p.x - d.start.x, p.y - d.start.y);
        commit(moveOp(d.info, playheadUs, next.x, next.y), `gizmo:move:${d.info.clip.id}`);
        break;
      }
      case "scale": {
        const [sx, sy] = dragScale(d.scale, d.origin, d.start, p);
        commit(scaleOp(d.info, playheadUs, sx, sy), `gizmo:scale:${d.info.clip.id}`);
        break;
      }
      case "rotate": {
        const deg = dragRotate(d.rotation, d.origin, d.start, p, e.shiftKey);
        commit(rotateOp(d.info, playheadUs, deg), `gizmo:rotate:${d.info.clip.id}`);
        break;
      }
      case "vertex": {
        const next = movePoint(d.path, d.index, d.editable.fromComp([p.x, p.y]));
        commit(d.editable.write(next), `path:${d.editable.id}:${String(d.index)}`);
        break;
      }
      case "tangent": {
        const handle = d.editable.fromComp([p.x, p.y]);
        const next =
          d.which === "out"
            ? setOutTangent(d.path, d.index, handle, e.altKey)
            : setInTangent(d.path, d.index, handle, e.altKey);
        commit(d.editable.write(next), `path:${d.editable.id}:${String(d.index)}:${d.which}`);
        break;
      }
      case "key": {
        commit(
          {
            type: "updateKeyframe",
            clipId: d.info.clip.id,
            path: POSITION_PATH,
            tUs: d.key.tUs,
            keyframe: { ...d.key, value: [p.x, p.y] },
          },
          `motion:${d.info.clip.id}:${String(d.key.tUs)}`,
        );
        break;
      }
      case "keyTangent": {
        const at = keyPoint(d.key);
        if (at === null) break;
        const offset: Vec2 = [p.x - at[0], p.y - at[1]];
        const old = d.key.spatialTangents ?? { in: [0, 0] as Vec2, out: [0, 0] as Vec2 };
        const tangents =
          d.which === "out"
            ? { in: e.altKey ? old.in : ([-offset[0], -offset[1]] as Vec2), out: offset }
            : { out: e.altKey ? old.out : ([-offset[0], -offset[1]] as Vec2), in: offset };
        commit(
          {
            type: "updateKeyframe",
            clipId: d.info.clip.id,
            path: POSITION_PATH,
            tUs: d.key.tUs,
            keyframe: { ...d.key, interpolation: "bezier", spatialTangents: tangents },
          },
          `motion:${d.info.clip.id}:${String(d.key.tUs)}:${d.which}`,
        );
        break;
      }
      case "draw":
        d.current = p;
        setDraft({ tool: d.tool, a: d.start, b: p });
        break;
    }
  }

  function onUp(): void {
    const d = drag.current;
    drag.current = null;
    if (canvasTool === "pen") setPen((s) => penRelease(s));
    if (d?.kind === "draw") {
      setDraft(null);
      const w = Math.abs(d.current.x - d.start.x);
      const h = Math.abs(d.current.y - d.start.y);
      if (w > 4 && h > 4) {
        props.onRun("shape.add", {
          kind: d.tool,
          x: (d.current.x + d.start.x) / 2,
          y: (d.current.y + d.start.y) / 2,
          width: w,
          height: h,
        });
      }
    }
  }

  function onBackgroundDown(e: React.PointerEvent): void {
    const p = point(e);
    if (p === null) return;
    if (canvasTool === "pen") {
      const { state, closed } = penPress(pen, [p.x, p.y], 10 * unit);
      if (closed) {
        finishPen(true);
        return;
      }
      setPen(state);
      drag.current = null;
      svgRef.current?.setPointerCapture(e.pointerId);
      return;
    }
    if (SHAPE_TOOLS.has(canvasTool)) {
      const tool = canvasTool as Exclude<CanvasTool, "select" | "pen">;
      begin({ kind: "draw", tool, start: p, current: p }, e);
      return;
    }
    // Select tool: pick what is under the pointer and start moving it.
    setVertex(null);
    setKeyIndex(null);
    const hit = clipAt(p);
    if (hit === undefined) {
      props.onSelectClips([]);
      return;
    }
    props.onSelectClips([hit.clip.id]);
    const animated = animatedClip(hit.clip, Math.max(0, playheadUs - hit.clip.startUs));
    begin(
      { kind: "move", info: hit, start: p, pos: [animated.transform.x, animated.transform.y] },
      e,
    );
  }

  const r = 5 * unit;
  const stroke = 1.5 * unit;
  const cursor = canvasTool === "select" ? "default" : "crosshair";

  // --- Gizmo -----------------------------------------------------------------------------------
  const gizmo =
    canvasTool === "select" && single !== undefined && geometry !== null
      ? (() => {
          const c = geometry.corners;
          const centre = apply(geometry.m, geometry.box.shift.x, geometry.box.shift.y);
          const origin: Point = {
            x: geometry.animated.transform.x,
            y: geometry.animated.transform.y,
          };
          const topMid: Point = { x: (c[0].x + c[1].x) / 2, y: (c[0].y + c[1].y) / 2 };
          const mid: Point = { x: (c[0].x + c[2].x) / 2, y: (c[0].y + c[2].y) / 2 };
          const away = { x: topMid.x - mid.x, y: topMid.y - mid.y };
          const norm = Math.hypot(away.x, away.y) || 1;
          const rotateAt: Point = {
            x: topMid.x + (away.x / norm) * 26 * unit,
            y: topMid.y + (away.y / norm) * 26 * unit,
          };
          const t = geometry.animated.transform;
          return (
            <g data-testid="gizmo">
              <polygon
                points={c.map((q) => `${String(q.x)},${String(q.y)}`).join(" ")}
                fill="transparent"
                stroke="#38bdf8"
                strokeWidth={stroke}
                style={{ cursor: "move" }}
                onPointerDown={(e) => {
                  const p = point(e);
                  if (p === null) return;
                  begin({ kind: "move", info: single, start: p, pos: [t.x, t.y] }, e);
                }}
              />
              <line
                x1={topMid.x}
                y1={topMid.y}
                x2={rotateAt.x}
                y2={rotateAt.y}
                stroke="#38bdf8"
                strokeWidth={stroke}
              />
              <circle
                data-handle="rotate"
                cx={rotateAt.x}
                cy={rotateAt.y}
                r={r}
                fill="#0c4a6e"
                stroke="#38bdf8"
                strokeWidth={stroke}
                style={{ cursor: "grab" }}
                onPointerDown={(e) => {
                  const p = point(e);
                  if (p === null) return;
                  begin(
                    { kind: "rotate", info: single, origin, start: p, rotation: t.rotation },
                    e,
                  );
                }}
              />
              {c.map((q, i) => (
                <rect
                  key={i}
                  data-handle="scale"
                  x={q.x - r}
                  y={q.y - r}
                  width={2 * r}
                  height={2 * r}
                  fill="#e0f2fe"
                  stroke="#0369a1"
                  strokeWidth={stroke}
                  style={{ cursor: "nwse-resize" }}
                  onPointerDown={(e) => {
                    const p = point(e);
                    if (p === null) return;
                    begin(
                      {
                        kind: "scale",
                        info: single,
                        origin,
                        start: p,
                        scale: [t.scaleX, t.scaleY],
                      },
                      e,
                    );
                  }}
                />
              ))}
              <circle cx={centre.x} cy={centre.y} r={r * 0.5} fill="#38bdf8" pointerEvents="none" />
            </g>
          );
        })()
      : null;

  // --- Path points -----------------------------------------------------------------------------
  const pathLayer =
    canvasTool === "select"
      ? paths.map((ep) => {
          const verts = ep.path.vertices;
          return (
            <g key={ep.id} data-path={ep.id}>
              <path
                d={svgPath({
                  ...ep.path,
                  vertices: verts.map((v) => ({
                    point: ep.toComp(v.point),
                    inTangent: ep.vectorToComp(v.inTangent),
                    outTangent: ep.vectorToComp(v.outTangent),
                  })),
                })}
                fill="none"
                stroke="#f59e0b"
                strokeWidth={stroke}
              />
              <path
                d={svgPath({
                  ...ep.path,
                  vertices: verts.map((v) => ({
                    point: ep.toComp(v.point),
                    inTangent: ep.vectorToComp(v.inTangent),
                    outTangent: ep.vectorToComp(v.outTangent),
                  })),
                })}
                fill="none"
                stroke="transparent"
                strokeWidth={10 * unit}
                style={{ cursor: "copy" }}
                onPointerDown={(e) => {
                  const p = point(e);
                  if (p === null) return;
                  const near = nearestOnPath(ep.path, ep.fromComp([p.x, p.y]));
                  if (near === null) return;
                  const inserted = insertVertex(ep.path, near.segment, near.t);
                  commit(ep.write(inserted), `path:${ep.id}:insert`);
                  setVertex({ pathId: ep.id, index: near.segment + 1 });
                  begin(
                    { kind: "vertex", editable: ep, index: near.segment + 1, path: inserted },
                    e,
                  );
                }}
              />
              {verts.map((v, i) => {
                const at = ep.toComp(v.point);
                const hin = ep.toComp([v.point[0] + v.inTangent[0], v.point[1] + v.inTangent[1]]);
                const hout = ep.toComp([
                  v.point[0] + v.outTangent[0],
                  v.point[1] + v.outTangent[1],
                ]);
                const chosen = vertex?.pathId === ep.id && vertex.index === i;
                const hasTangents =
                  v.inTangent[0] !== 0 ||
                  v.inTangent[1] !== 0 ||
                  v.outTangent[0] !== 0 ||
                  v.outTangent[1] !== 0;
                return (
                  <g key={i}>
                    {(chosen || hasTangents) && (
                      <>
                        <line
                          x1={at[0]}
                          y1={at[1]}
                          x2={hin[0]}
                          y2={hin[1]}
                          stroke="#a3a3a3"
                          strokeWidth={stroke}
                        />
                        <line
                          x1={at[0]}
                          y1={at[1]}
                          x2={hout[0]}
                          y2={hout[1]}
                          stroke="#a3a3a3"
                          strokeWidth={stroke}
                        />
                        {(["in", "out"] as const).map((which) => {
                          const h = which === "in" ? hin : hout;
                          return (
                            <circle
                              key={which}
                              data-handle={`tangent-${which}`}
                              cx={h[0]}
                              cy={h[1]}
                              r={r * 0.8}
                              fill="#fbbf24"
                              stroke="#78350f"
                              strokeWidth={stroke}
                              style={{ cursor: "grab" }}
                              onPointerDown={(e) => {
                                setVertex({ pathId: ep.id, index: i });
                                begin(
                                  { kind: "tangent", editable: ep, index: i, which, path: ep.path },
                                  e,
                                );
                              }}
                            />
                          );
                        })}
                      </>
                    )}
                    <rect
                      data-handle="vertex"
                      x={at[0] - r}
                      y={at[1] - r}
                      width={2 * r}
                      height={2 * r}
                      fill={chosen ? "#f59e0b" : "#ffffff"}
                      stroke="#92400e"
                      strokeWidth={stroke}
                      style={{ cursor: "move" }}
                      onPointerDown={(e) => {
                        setVertex({ pathId: ep.id, index: i });
                        if (e.altKey) {
                          const op = ep.write(removeVertex(ep.path, i));
                          if (op !== null) props.onCommit(op, undefined);
                          setVertex(null);
                          e.stopPropagation();
                          return;
                        }
                        begin({ kind: "vertex", editable: ep, index: i, path: ep.path }, e);
                      }}
                      onDoubleClick={() => {
                        const op = ep.write(toggleSmooth(ep.path, i));
                        if (op !== null) props.onCommit(op, undefined);
                      }}
                    />
                  </g>
                );
              })}
            </g>
          );
        })
      : null;

  // --- Motion path -----------------------------------------------------------------------------
  const keys = single === undefined ? [] : positionKeys(single.clip);
  const motion =
    canvasTool === "select" && single !== undefined && keys.length >= 2 ? (
      <g data-testid="motion-path">
        <polyline
          points={samplePositionPath(single.clip)
            .map((q) => `${String(q[0])},${String(q[1])}`)
            .join(" ")}
          fill="none"
          stroke="#a78bfa"
          strokeWidth={stroke}
          strokeDasharray={`${String(6 * unit)} ${String(4 * unit)}`}
          pointerEvents="none"
        />
        {keys.map((k, i) => {
          const at = keyPoint(k);
          if (at === null) return null;
          const tangents = k.spatialTangents;
          const open = keyIndex === i;
          return (
            <g key={k.tUs}>
              {open &&
                (["in", "out"] as const).map((which) => {
                  const t = tangents?.[which] ?? [0, 0];
                  const hx = at[0] + t[0];
                  const hy = at[1] + t[1];
                  return (
                    <g key={which}>
                      <line
                        x1={at[0]}
                        y1={at[1]}
                        x2={hx}
                        y2={hy}
                        stroke="#c4b5fd"
                        strokeWidth={stroke}
                      />
                      <circle
                        data-handle={`motion-${which}`}
                        cx={hx}
                        cy={hy}
                        r={r * 0.8}
                        fill="#ddd6fe"
                        stroke="#5b21b6"
                        strokeWidth={stroke}
                        style={{ cursor: "grab" }}
                        onPointerDown={(e) => {
                          begin({ kind: "keyTangent", info: single, key: k, which }, e);
                        }}
                      />
                    </g>
                  );
                })}
              <rect
                data-handle="motion-key"
                x={at[0] - r}
                y={at[1] - r}
                width={2 * r}
                height={2 * r}
                transform={`rotate(45 ${String(at[0])} ${String(at[1])})`}
                fill={open ? "#a78bfa" : "#ede9fe"}
                stroke="#5b21b6"
                strokeWidth={stroke}
                style={{ cursor: "move" }}
                onPointerDown={(e) => {
                  setKeyIndex(i);
                  if (e.altKey) {
                    const auto = autoTangents(keys, i);
                    if (auto !== null) {
                      props.onCommit(
                        {
                          type: "updateKeyframe",
                          clipId: single.clip.id,
                          path: POSITION_PATH,
                          tUs: k.tUs,
                          keyframe: { ...k, interpolation: "bezier", spatialTangents: auto },
                        },
                        undefined,
                      );
                    }
                    e.stopPropagation();
                    return;
                  }
                  begin({ kind: "key", info: single, key: k }, e);
                }}
              />
            </g>
          );
        })}
      </g>
    ) : null;

  // --- Drawing previews ------------------------------------------------------------------------
  const preview =
    draft === null
      ? null
      : (() => {
          const x = Math.min(draft.a.x, draft.b.x);
          const y = Math.min(draft.a.y, draft.b.y);
          const w = Math.abs(draft.a.x - draft.b.x);
          const h = Math.abs(draft.a.y - draft.b.y);
          return draft.tool === "ellipse" ? (
            <ellipse
              cx={x + w / 2}
              cy={y + h / 2}
              rx={w / 2}
              ry={h / 2}
              fill="rgba(56,189,248,0.2)"
              stroke="#38bdf8"
              strokeWidth={stroke}
            />
          ) : (
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              fill="rgba(56,189,248,0.2)"
              stroke="#38bdf8"
              strokeWidth={stroke}
            />
          );
        })();
  const penDraft = penPath(pen, false);

  return (
    <svg
      ref={svgRef}
      data-testid="preview-overlay"
      data-tool={canvasTool}
      viewBox={`0 0 ${String(composition.width)} ${String(composition.height)}`}
      preserveAspectRatio="xMidYMid meet"
      className="absolute inset-0 h-full w-full touch-none"
      style={{ cursor }}
      onPointerDown={onBackgroundDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onDoubleClick={() => {
        if (canvasTool === "pen" && pen.vertices.length >= 2) {
          // The press that started this double-click added a vertex: drop it, then finish open.
          const trimmed = penUndo(pen);
          const path = penPath(trimmed, false);
          setPen(EMPTY_PEN);
          if (path === null) return;
          if (penMode === "mask" && single !== undefined) props.onRun("mask.addPath", { path });
          else props.onRun("shape.addPath", { path });
        }
      }}
    >
      <rect x={0} y={0} width={composition.width} height={composition.height} fill="transparent" />
      {pathLayer}
      {motion}
      {gizmo}
      {preview}
      {pen.vertices.length > 0 && (
        <g data-testid="pen-draft">
          {penDraft !== null && (
            <path d={svgPath(penDraft)} fill="none" stroke="#38bdf8" strokeWidth={stroke * 1.5} />
          )}
          {pen.vertices.map((v, i) => (
            <rect
              key={i}
              x={v.point[0] - r}
              y={v.point[1] - r}
              width={2 * r}
              height={2 * r}
              fill={i === 0 ? "#f43f5e" : "#e0f2fe"}
              stroke="#0369a1"
              strokeWidth={stroke}
              pointerEvents="none"
            />
          ))}
        </g>
      )}
    </svg>
  );
}
