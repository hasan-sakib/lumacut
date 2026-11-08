import { runAction, type AnyAction } from "@lumacut/actions";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { editingActions, type EditingContext, type EditingServices } from "../actions/editing.ts";
import "../actions/canvas.ts";
import "../actions/canvasEdit.ts";
import "../actions/colour.ts";
import "../actions/compositions.ts";
import "../actions/effects.ts";
import "../actions/export.ts";
import "../actions/layers.ts";
import "../actions/marquee.ts";
import "../actions/masks.ts";
import "../actions/paint.ts";
import "../actions/photoLayers.ts";
import "../actions/photoTools.ts";
import "../actions/presets.ts";
import "../actions/shapes.ts";
import "../actions/text.ts";
import "../actions/transitions.ts";
import "../actions/keyframes.ts";
import { newId } from "../lib/ids.ts";
import { downloadBlob, renderProjectImage } from "../photo/export-image.ts";
import { fitZoom, zoomBy } from "../timeline/geometry.ts";
import { resolveAssetQuery } from "../lib/project-assets.ts";
import { useAssetsStore } from "../stores/assets.ts";
import { useEditorStore } from "../stores/editor.ts";
import { projectStore, useProjectStore } from "../stores/project.ts";

export interface EditingUi {
  openPalette: () => void;
  showShortcuts: () => void;
  openExport?: () => void;
  togglePlay: () => void;
  seek: (us: number) => void;
}

export interface EditingHost {
  ctx: EditingContext;
  /** Runs an action by id; resolves with an error message to show, or null on success. */
  run: (id: string, args?: unknown) => Promise<string | null>;
  runAction: (action: AnyAction<EditingContext>, args?: unknown) => void;
}

/**
 * Connects the editing actions to the live stores: builds their context from the project, the
 * selection and the playhead, and runs them so every op they return goes through the project
 * store's `dispatch` (validated by `applyOp`, one undo step per action).
 */
export function useEditingHost(ui: EditingUi): EditingHost {
  const project = useProjectStore((s) => s.project);
  const canUndo = useProjectStore((s) => s.undoStack.length > 0);
  const canRedo = useProjectStore((s) => s.redoStack.length > 0);
  const activeCompositionId = useEditorStore((s) => s.activeCompositionId);
  const selectedClipIds = useEditorStore((s) => s.selectedClipIds);
  const selectedTrackId = useEditorStore((s) => s.selectedTrackId);
  const playheadUs = useEditorStore((s) => s.playheadUs);
  const canvasTool = useEditorStore((s) => s.canvasTool);
  const penMode = useEditorStore((s) => s.penMode);
  const brush = useEditorStore((s) => s.brush);
  const selection = useEditorStore((s) => s.selection);
  const photoView = useEditorStore((s) => s.photoView);
  const photoViewport = useEditorStore((s) => s.photoViewport);
  const clipboard = useEditorStore((s) => s.clipboard);
  const attributes = useEditorStore((s) => s.attributes);
  const { openPalette, showShortcuts, openExport, togglePlay, seek } = ui;

  const services = useMemo<EditingServices>(
    () => ({
      newId,
      undo: () => {
        projectStore.getState().undo();
      },
      redo: () => {
        projectStore.getState().redo();
      },
      resolveAsset: (query) =>
        resolveAssetQuery(Object.values(useAssetsStore.getState().byId), query),
      clipboard: {
        setClips: (data) => {
          useEditorStore.getState().setClipboard(data);
        },
        setAttributes: (attrs) => {
          useEditorStore.getState().setAttributes(attrs);
        },
      },
      openPalette,
      showShortcuts,
      ...(openExport === undefined ? {} : { openExport }),
      playback: { togglePlay, seek },
      editor: {
        setTool: (tool) => {
          useEditorStore.getState().setTool(tool);
        },
        zoomBy: (factor) => {
          const editor = useEditorStore.getState();
          editor.setZoom(zoomBy(editor.zoomPxPerSec, factor));
        },
        zoomFit: () => {
          const editor = useEditorStore.getState();
          const comp = projectStore
            .getState()
            .project?.compositions.find((c) => c.id === editor.activeCompositionId);
          editor.setZoom(fitZoom(comp?.durationUs ?? 0, editor.viewportPx));
          editor.setScroll(0);
        },
        toggleSnapping: () => {
          const editor = useEditorStore.getState();
          editor.setSnapping(!editor.snapping);
        },
        selectClips: (ids) => {
          useEditorStore.getState().selectClips(ids);
        },
        setBottomPanel: (panel) => {
          useEditorStore.getState().setBottomPanel(panel);
        },
        setCanvasTool: (tool) => {
          useEditorStore.getState().setCanvasTool(tool);
        },
        setPenMode: (mode) => {
          useEditorStore.getState().setPenMode(mode);
        },
        photo: {
          setBrush: (patch) => {
            useEditorStore.getState().setBrush(patch);
          },
          setSelection: (next) => {
            useEditorStore.getState().setSelection(next);
          },
          setView: (view) => {
            useEditorStore.getState().setPhotoView(view);
          },
          download: downloadBlob,
          renderImage: (request) => {
            const current = projectStore.getState().project;
            if (current === null) return Promise.reject(new Error("No project is open."));
            return renderProjectImage(current, request);
          },
        },
        openComposition: (id) => {
          useEditorStore.getState().openComposition(id);
        },
        closeComposition: (levelId) => {
          useEditorStore.getState().closeComposition(levelId);
        },
      },
    }),
    [openPalette, showShortcuts, openExport, togglePlay, seek],
  );

  const ctx = useMemo<EditingContext>(
    () => ({
      project,
      compositionId: activeCompositionId ?? project?.mainCompositionId ?? null,
      selectedClipIds,
      selectedTrackId,
      playheadUs,
      canvasTool,
      penMode,
      photo: { brush, selection, view: photoView, viewport: photoViewport },
      canUndo,
      canRedo,
      hasClipboard: clipboard !== null,
      hasAttributes: attributes !== null,
      clipboard,
      attributes,
      services,
    }),
    [
      project,
      activeCompositionId,
      selectedClipIds,
      selectedTrackId,
      playheadUs,
      canvasTool,
      penMode,
      brush,
      selection,
      photoView,
      photoViewport,
      canUndo,
      canRedo,
      clipboard,
      attributes,
      services,
    ],
  );

  const latest = useRef(ctx);
  useEffect(() => {
    latest.current = ctx;
  });

  const run = useCallback(async (id: string, args?: unknown): Promise<string | null> => {
    try {
      await runAction(editingActions, id, latest.current, args, (op, label) => {
        const result = projectStore.getState().dispatch(op, { label });
        if (!result.ok) throw new Error(result.message);
      });
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "That didn't work.";
    }
  }, []);

  const runFromUi = useCallback(
    (action: AnyAction<EditingContext>, args?: unknown) => {
      void run(action.id, args);
    },
    [run],
  );

  return { ctx, run, runAction: runFromUi };
}
