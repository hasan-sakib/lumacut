import { runAction, type AnyAction } from "@lumacut/actions";
import { useCallback, useMemo, useRef } from "react";
import { editingActions, type EditingContext, type EditingServices } from "../actions/editing.ts";
import { newId } from "../lib/ids.ts";
import { fitZoom, zoomBy } from "../timeline/geometry.ts";
import { resolveAssetQuery } from "../lib/project-assets.ts";
import { useAssetsStore } from "../stores/assets.ts";
import { useEditorStore } from "../stores/editor.ts";
import { projectStore, useProjectStore } from "../stores/project.ts";

export interface EditingUi {
  openPalette: () => void;
  showShortcuts: () => void;
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
  const clipboard = useEditorStore((s) => s.clipboard);
  const attributes = useEditorStore((s) => s.attributes);
  const { openPalette, showShortcuts, togglePlay, seek } = ui;

  const services = useMemo<EditingServices>(
    () => ({
      newId,
      undo: () => {
        projectStore.getState().undo();
      },
      redo: () => {
        projectStore.getState().redo();
      },
      resolveAsset: (query) => resolveAssetQuery(Object.values(useAssetsStore.getState().byId), query),
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
          const comp = projectStore.getState().project?.compositions.find((c) => c.id === editor.activeCompositionId);
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
      },
    }),
    [openPalette, showShortcuts, togglePlay, seek],
  );

  const ctx = useMemo<EditingContext>(
    () => ({
      project,
      compositionId: activeCompositionId ?? project?.mainCompositionId ?? null,
      selectedClipIds,
      selectedTrackId,
      playheadUs,
      canUndo,
      canRedo,
      hasClipboard: clipboard !== null,
      hasAttributes: attributes !== null,
      clipboard,
      attributes,
      services,
    }),
    [project, activeCompositionId, selectedClipIds, selectedTrackId, playheadUs, canUndo, canRedo, clipboard, attributes, services],
  );

  const latest = useRef(ctx);
  latest.current = ctx;

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
