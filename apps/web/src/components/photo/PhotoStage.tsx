import type { Composition, Project } from "@lumacut/schema";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Preview } from "../../editor/usePreview.ts";
import type { ClipInfo } from "../../inspector/fields.ts";
import {
  canvasToScreen,
  effectiveZoom,
  engineWindow,
  overlayViewBox,
  panBy,
  visibleRect,
  zoomAbout,
} from "../../photo/view.ts";
import { useEditorStore } from "../../stores/editor.ts";
import { usePhotoStore } from "../../stores/photo.ts";
import { PreviewOverlay } from "../preview/PreviewOverlay.tsx";
import type { Op } from "@lumacut/schema";
import { PhotoOverlay } from "./PhotoOverlay.tsx";
import type { MaskBrushControls } from "./useMaskBrush.ts";

interface PhotoStageProps {
  project: Project;
  composition: Composition;
  selected: readonly ClipInfo[];
  preview: Pick<Preview, "attachStage" | "setView">;
  /** Runs a registry action; resolves with an error to show, or null. */
  run: (id: string, args?: unknown) => Promise<string | null>;
  onCommit: (op: Op, coalesceKey: string | undefined) => void;
  maskBrush: MaskBrushControls;
}

const CHECKER =
  "conic-gradient(#3a3a3a 25%, #2c2c2c 0 50%, #3a3a3a 0 75%, #2c2c2c 0) 0 0 / 16px 16px";

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT" ||
      target.isContentEditable)
  );
}

/**
 * The photo canvas: the picture drawn by the engine for just the visible part of the canvas (so a
 * 6000 px photo is cheap to show), zoom and pan, and the overlays that carry the tools. The engine
 * window follows the zoom and pan; the canvas element is placed on screen to match.
 */
export function PhotoStage(props: PhotoStageProps) {
  const { project, composition, selected } = props;
  const { attachStage, setView: setEngineView } = props.preview;
  const editor = useEditorStore();
  const photo = usePhotoStore();
  const view = editor.photoView;
  const frame = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [spaceDown, setSpaceDown] = useState(false);
  const [grabbing, setGrabbing] = useState(false);
  const panning = useRef<{ x: number; y: number } | null>(null);
  const canvasSize = { width: composition.width, height: composition.height };

  useLayoutEffect(() => {
    const el = frame.current;
    if (el === null) return;
    const update = () => {
      const box = el.getBoundingClientRect();
      const next = { width: Math.round(box.width), height: Math.round(box.height) };
      setSize(next);
      useEditorStore.getState().setPhotoViewport(next);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, []);

  // The window the engine draws follows the zoom and pan.
  useEffect(() => {
    if (size.width === 0 || size.height === 0) return;
    const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio;
    const wanted = engineWindow(view, canvasSize, size, dpr);
    const handle = requestAnimationFrame(() => {
      // Panned entirely off the canvas: draw a single pixel rather than the whole picture.
      setEngineView(wanted ?? { x: 0, y: 0, width: 1, height: 1, scale: 1 });
    });
    return () => {
      cancelAnimationFrame(handle);
    };
    // canvasSize is rebuilt each render from two numbers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, composition.width, composition.height, size, setEngineView]);

  // Zoom and scroll with the wheel / trackpad (pinch arrives as ctrl + wheel).
  useEffect(() => {
    const el = frame.current;
    if (el === null) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const state = useEditorStore.getState();
      const box = el.getBoundingClientRect();
      const viewport = { width: box.width, height: box.height };
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * 0.01);
        state.setPhotoView(
          zoomAbout(state.photoView, canvasSize, viewport, factor, {
            x: e.clientX - box.left,
            y: e.clientY - box.top,
          }),
        );
      } else {
        state.setPhotoView(
          panBy(
            state.photoView,
            canvasSize,
            viewport,
            -(e.shiftKey ? e.deltaY : e.deltaX),
            -(e.shiftKey ? 0 : e.deltaY),
          ),
        );
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
    };
    // canvasSize is rebuilt each render from two numbers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composition.width, composition.height]);

  // Holding Space turns any tool into the hand.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isTyping(e.target)) setSpaceDown(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceDown(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const handTool = editor.canvasTool === "hand" || spaceDown;
  const zoomTool = editor.canvasTool === "zoom" && !spaceDown;

  const local = useCallback((e: { clientX: number; clientY: number }) => {
    const box = frame.current?.getBoundingClientRect();
    return box === undefined ? { x: 0, y: 0 } : { x: e.clientX - box.left, y: e.clientY - box.top };
  }, []);

  const rect = visibleRect(view, canvasSize, size);
  const zoom = effectiveZoom(view, canvasSize, size);
  let placement: React.CSSProperties = { display: "none" };
  if (rect !== null && size.width > 0) {
    const topLeft = canvasToScreen(view, canvasSize, size, { x: rect.x, y: rect.y });
    placement = {
      left: topLeft.x,
      top: topLeft.y,
      width: rect.width * zoom,
      height: rect.height * zoom,
    };
  }
  const viewBox =
    size.width > 0
      ? overlayViewBox(view, canvasSize, size)
      : `0 0 ${String(canvasSize.width)} ${String(canvasSize.height)}`;
  const selectedSingle = selected.length === 1 ? selected[0] : undefined;

  return (
    <div
      ref={frame}
      data-testid="photo-stage"
      className="relative min-h-0 flex-1 overflow-hidden bg-neutral-900"
    >
      <div
        ref={attachStage}
        data-testid="preview"
        className="absolute"
        style={{ ...placement, background: CHECKER }}
      />
      <PreviewOverlay
        project={project}
        composition={composition}
        selected={selected}
        playheadUs={editor.playheadUs}
        canvasTool={editor.canvasTool}
        penMode={editor.penMode}
        viewBox={viewBox}
        onCommit={props.onCommit}
        onRun={(id, args) => void props.run(id, args)}
        onSelectClips={editor.selectClips}
      />
      <PhotoOverlay
        canvas={canvasSize}
        canvasTool={editor.canvasTool}
        brush={editor.brush}
        selection={editor.selection}
        viewBox={viewBox}
        crop={photo.crop}
        cropAspect={photo.cropAspect}
        straighten={photo.straighten}
        maskMode={photo.maskMode}
        canMask={selectedSingle !== undefined && selectedSingle.track?.kind === "visual"}
        onSelection={editor.setSelection}
        onCrop={photo.setCrop}
        onStroke={(tool, points) => {
          void props.run("paint.stroke", { tool, points });
        }}
        onMaskStroke={props.maskBrush.addStroke}
      />
      {(handTool || zoomTool) && (
        <div
          data-testid="view-tool"
          className="absolute inset-0 z-20"
          style={{
            cursor: handTool ? (grabbing ? "grabbing" : "grab") : "zoom-in",
          }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            if (handTool) {
              panning.current = local(e);
              setGrabbing(true);
            } else {
              const at = local(e);
              editor.setPhotoView(zoomAbout(view, canvasSize, size, e.altKey ? 1 / 1.6 : 1.6, at));
            }
          }}
          onPointerMove={(e) => {
            const last = panning.current;
            if (last === null) return;
            const now = local(e);
            editor.setPhotoView(panBy(view, canvasSize, size, now.x - last.x, now.y - last.y));
            panning.current = now;
          }}
          onPointerUp={() => {
            panning.current = null;
            setGrabbing(false);
          }}
          onPointerCancel={() => {
            panning.current = null;
            setGrabbing(false);
          }}
        />
      )}
    </div>
  );
}
