import { runAction, type AnyAction } from "@lumacut/actions";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { editingActions, type EditingContext, type EditingServices } from "../actions/editing.ts";
import "../actions/audio.ts";
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
import "../actions/simple.ts";
import "../actions/templates.ts";
import "../actions/text.ts";
import "../actions/transitions.ts";
import "../actions/workspaces.ts";
import "../actions/keyframes.ts";
import { renderMix } from "@lumacut/engine";
import { createApiAssetResolver } from "../engine/resolver.ts";
import { newId } from "../lib/ids.ts";
import { useAudioStore } from "../stores/audio.ts";
import { usePrefsStore } from "../stores/prefs.ts";
import { saveTemplate } from "../api/templates.ts";
import { packMainTrackOps } from "../timeline/magnetic.ts";
import { useExportsStore } from "../stores/exports.ts";
import { exportInBrowser } from "../export/browser.ts";
import { cancelServerExport, createServerExport } from "../export/server.ts";
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
  /** Starts a new running loudness measurement in the live meters. */
  resetLoudness?: () => void;
  /** Shows the server exports list. */
  openExports?: () => void;
  /** Shows a side panel tab. */
  showTab?: (tab: string) => void;
  /** Shows a panel arrangement, and reads the current one. */
  applyWorkspace?: (layout: {
    id: string;
    sideTab: string;
    bottom: "timeline" | "graph" | "mixer";
  }) => void;
  currentLayout?: () => { sideTab: string; bottom: "timeline" | "graph" | "mixer" };
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
  const {
    openPalette,
    showShortcuts,
    openExport,
    resetLoudness,
    openExports,
    showTab,
    applyWorkspace,
    currentLayout,
    togglePlay,
    seek,
  } = ui;
  const mode = usePrefsStore((s) => s.mode);

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
      templates: {
        save: async (name, category, description) => {
          const current = projectStore.getState().project;
          if (current === null) throw new Error("No project is open.");
          await saveTemplate(name, category, description, current);
        },
      },
      markStep: (step) => {
        usePrefsStore.getState().completeStep(step);
      },
      workspace: {
        apply: (layout) => {
          applyWorkspace?.(layout);
          usePrefsStore.getState().setWorkspace(layout.id);
        },
        current: () => currentLayout?.() ?? { sideTab: "inspector", bottom: "timeline" },
        save: (name) => {
          const now = currentLayout?.() ?? { sideTab: "inspector", bottom: "timeline" as const };
          const id = `saved-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
          usePrefsStore.getState().saveWorkspace({ id, name, ...now });
        },
        remove: (id) => {
          usePrefsStore.getState().deleteWorkspace(id);
        },
        saved: () => usePrefsStore.getState().savedWorkspaces,
        tour: () => {
          usePrefsStore.getState().resetTour();
        },
      },
      exports: {
        inBrowser: async (compositionId, settings) => {
          const current = projectStore.getState().project;
          if (current === null) throw new Error("No project is open.");
          const store = useExportsStore.getState();
          const label = `${settings.format.toUpperCase()} ${settings.resolution}`;
          const handle = exportInBrowser(current, compositionId, settings, (phase, done, total) => {
            const running = useExportsStore.getState().browser;
            if (running !== null) store.setBrowser({ ...running, phase, done, total });
          });
          store.setBrowser({ label, phase: "sound", done: 0, total: 1, cancel: handle.cancel });
          try {
            const { blob } = await handle.done;
            const name = (current.name.replace(/[^\w .-]+/g, "").trim() || "export").replace(
              /\s+/g,
              "-",
            );
            downloadBlob(blob, `${name}.${settings.format}`);
          } finally {
            store.setBrowser(null);
          }
        },
        onServer: async (compositionId, settings) => {
          const project = projectStore.getState();
          if (project.project === null) throw new Error("No project is open.");
          // The server exports the saved project: save what is on screen first.
          await project.saveNow();
          if (projectStore.getState().saveState !== "saved") {
            throw new Error("The project couldn't be saved, so the server can't export it yet.");
          }
          const item = await createServerExport(project.project.id, compositionId, settings);
          useExportsStore.getState().upsert(item);
        },
        cancel: async (id) => {
          if (id === null) {
            useExportsStore.getState().browser?.cancel();
            return;
          }
          await cancelServerExport(id);
        },
        openPanel: () => {
          openExports?.();
        },
        busy: () => useExportsStore.getState().browser !== null,
      },
      audio: {
        renderMix: async (compositionId, fromUs, toUs) => {
          const current = projectStore.getState().project;
          if (current === null) throw new Error("No project is open.");
          const mix = await renderMix(current, createApiAssetResolver(), {
            compositionId,
            fromUs,
            toUs,
          });
          return { channels: mix.channels, sampleRate: mix.sampleRate };
        },
        download: downloadBlob,
        showLoudness: (report) => {
          useAudioStore.getState().setMeasured(report);
        },
        resetLoudness: () => {
          resetLoudness?.();
        },
      },
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
        setMode: (next) => {
          usePrefsStore.getState().setMode(next);
        },
        showTab: (tab) => {
          showTab?.(tab);
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
    [
      openPalette,
      showShortcuts,
      openExport,
      resetLoudness,
      openExports,
      showTab,
      applyWorkspace,
      currentLayout,
      togglePlay,
      seek,
    ],
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
      mode,
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
      mode,
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
  const runs = useRef(0);
  useEffect(() => {
    latest.current = ctx;
  });

  const run = useCallback(async (id: string, args?: unknown): Promise<string | null> => {
    try {
      // One key per run: the action's edit and Simple mode's gap closing are one undo step.
      runs.current += 1;
      const coalesceKey = `run:${String(runs.current)}`;
      await runAction(editingActions, id, latest.current, args, (op, label) => {
        const result = projectStore.getState().dispatch(op, { label, coalesceKey });
        if (!result.ok) throw new Error(result.message);
      });
      closeMainGaps(coalesceKey);
      const step = STEP_OF[id];
      if (step !== undefined) usePrefsStore.getState().completeStep(step);
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

/** "Getting started" steps that an action completes when it succeeds. */
const STEP_OF: Record<string, string> = {
  "caption.add": "captions",
  "caption.importSrt": "captions",
  "export.video": "export",
  "export.gif": "export",
  "export.mp3": "export",
  "export.audio": "export",
  "export.image": "export",
  "timeline.addAssetAtPlayhead": "media",
};

/**
 * Simple mode's magnetic main track: after an edit, the bottom picture track's clips are slid
 * together (merged into the same undo step through `coalesceKey`). Pro mode leaves gaps alone.
 */
export function closeMainGaps(coalesceKey: string): void {
  if (usePrefsStore.getState().mode !== "simple") return;
  const state = projectStore.getState();
  const editor = useEditorStore.getState();
  const comp = state.project?.compositions.find(
    (c) => c.id === (editor.activeCompositionId ?? state.project?.mainCompositionId),
  );
  if (comp === undefined || state.project?.kind === "photo") return;
  const ops = packMainTrackOps(comp);
  if (ops.length === 0) return;
  state.dispatch({ type: "batch", label: "Close gaps", ops }, { coalesceKey });
}
