import { runAction, type AnyAction } from "@lumacut/actions";
import { useCallback, useMemo, useRef } from "react";
import { editingActions, type EditingContext, type EditingServices } from "../actions/editing.ts";
import { newId } from "../lib/ids.ts";
import { toProjectAsset } from "../lib/project-assets.ts";
import { useAssetsStore } from "../stores/assets.ts";
import { useEditorStore } from "../stores/editor.ts";
import { projectStore, useProjectStore } from "../stores/project.ts";

export interface EditingUi {
  openPalette: () => void;
  showShortcuts: () => void;
}

export interface EditingHost {
  ctx: EditingContext;
  /** Runs an action by id; resolves with an error message to show, or null on success. */
  run: (id: string, args?: unknown) => Promise<string | null>;
  runAction: (action: AnyAction<EditingContext>) => void;
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
  const { openPalette, showShortcuts } = ui;

  const services = useMemo<EditingServices>(
    () => ({
      newId,
      undo: () => {
        projectStore.getState().undo();
      },
      redo: () => {
        projectStore.getState().redo();
      },
      assetForProject: (assetId) => {
        const asset = useAssetsStore.getState().byId[assetId];
        return asset === undefined ? null : toProjectAsset(asset);
      },
      openPalette,
      showShortcuts,
    }),
    [openPalette, showShortcuts],
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
      services,
    }),
    [project, activeCompositionId, selectedClipIds, selectedTrackId, playheadUs, canUndo, canRedo, services],
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
    (action: AnyAction<EditingContext>) => {
      void run(action.id);
    },
    [run],
  );

  return { ctx, run, runAction: runFromUi };
}
