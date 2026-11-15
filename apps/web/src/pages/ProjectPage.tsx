import type { Op, Project } from "@lumacut/schema";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import { editingActions } from "../actions/editing.ts";
import { useShortcuts } from "../actions/useShortcuts.ts";
import { ActionButton } from "../components/ActionButton.tsx";
import { Icon } from "../components/Icon.tsx";
import { GraphEditor } from "../components/graph/GraphEditor.tsx";
import { MixerPanel } from "../components/mixer/MixerPanel.tsx";
import { Tour } from "../components/onboarding/Tour.tsx";
import { WorkspaceMenu } from "../components/simple/WorkspaceMenu.tsx";
import { Browser } from "../components/browser/Browser.tsx";
import {
  KIND_LABEL,
  allItems,
  searchItems,
  type BrowserItem,
  type BrowserKind,
} from "../browser/items.ts";
import { applyOp } from "@lumacut/ops";
import { ModeSwitch } from "../components/simple/ModeSwitch.tsx";
import { SimpleBar } from "../components/simple/SimpleBar.tsx";
import { StickersPanel } from "../components/simple/StickersPanel.tsx";
import { SlotsPanel } from "../components/templates/SlotsPanel.tsx";
import { usePrefsStore } from "../stores/prefs.ts";
import { projectSlots } from "@lumacut/templates";
import { CanvasPanel } from "../components/photo/CanvasPanel.tsx";
import { ExportDialog } from "../components/export/ExportDialog.tsx";
import { ExportsPanel } from "../components/export/ExportsPanel.tsx";
import { useExportEvents } from "../editor/useExportEvents.ts";
import { deleteServerExport } from "../export/server.ts";
import { FiltersPanel } from "../components/photo/FiltersPanel.tsx";
import { LayersPanel } from "../components/photo/LayersPanel.tsx";
import { PhotoStage } from "../components/photo/PhotoStage.tsx";
import { ToolOptions } from "../components/photo/ToolOptions.tsx";
import { ToolRail } from "../components/photo/ToolRail.tsx";
import { useMaskBrush } from "../components/photo/useMaskBrush.ts";
import { PreviewOverlay } from "../components/preview/PreviewOverlay.tsx";
import { PresetsBrowser } from "../components/presets/PresetsBrowser.tsx";
import { ScopesPanel } from "../components/scopes/ScopesPanel.tsx";
import { TextBrowser } from "../components/text/TextBrowser.tsx";
import type { LutAsset } from "../components/color/LutPicker.tsx";
import { Inspector } from "../components/inspector/Inspector.tsx";
import { ActionContextMenu } from "../components/palette/ActionContextMenu.tsx";
import { CommandPalette, type PaletteExtra } from "../components/palette/CommandPalette.tsx";
import { ShortcutHelp } from "../components/palette/ShortcutHelp.tsx";
import { SaveStatus } from "../components/project/SaveStatus.tsx";
import { Timeline } from "../components/timeline/Timeline.tsx";
import { Toolbar } from "../components/timeline/Toolbar.tsx";
import { closeMainGaps, useEditingHost } from "../editor/useEditingHost.ts";
import { usePreview } from "../editor/usePreview.ts";
import { newId } from "../lib/ids.ts";
import { toProjectAsset } from "../lib/project-assets.ts";
import type { ClipInfo } from "../inspector/fields.ts";
import { findPlaced } from "../timeline/clips.ts";
import { useAssetsStore } from "../stores/assets.ts";
import { fitAspect } from "../photo/crop.ts";
import { useEditorStore } from "../stores/editor.ts";
import { usePhotoStore } from "../stores/photo.ts";
import { projectStore, useProjectStore } from "../stores/project.ts";

/**
 * The editor: preview on top, the Pro timeline below, a side panel for adding media and for the
 * history. Everything that changes the project goes through the editing actions or through a
 * timeline gesture, and from there through `projectStore.dispatch`.
 */
/** The side panel's tabs. */
type PanelTab =
  | "inspector"
  | "media"
  | "effects"
  | "presets"
  | "text"
  | "scopes"
  | "history"
  | "layers"
  | "filters"
  | "canvas"
  | "exports"
  | "slots"
  | "stickers";

const BROWSER_KINDS: readonly BrowserKind[] = ["effect", "transition", "audio", "preset", "look"];

/** Effects, transitions, presets and looks in the palette (SPEC §5.2), each through its action. */
const PALETTE_ITEMS = allItems().filter((i) => i.kind !== "template");
const paletteExtras = (query: string): PaletteExtra[] =>
  searchItems(PALETTE_ITEMS, query).map((i) => ({
    key: i.key,
    title: i.name,
    description: i.description,
    category: KIND_LABEL[i.kind],
    actionId: i.action.id,
    args: i.action.args,
  }));

const TAB_HINT: Record<PanelTab, string> = {
  inspector: "Settings of the selected clip",
  media: "Your library: add photos, videos and music",
  effects: "Effects, transitions, audio effects, presets and looks (hover to preview)",
  presets: "Motion presets with strength and length",
  text: "Titles and captions",
  scopes: "Waveform, vectorscope, histogram",
  history: "Every edit, newest first",
  layers: "The photo's layers",
  filters: "Looks and the effect library",
  canvas: "Canvas size, rotation and flips",
  exports: "Server exports: progress and downloads",
  slots: "The template's slots: your media, words and colours",
  stickers: "Stickers and shapes",
};

const TAB_LABEL: Record<PanelTab, string> = {
  inspector: "Properties",
  media: "Media",
  effects: "Effects",
  presets: "Presets",
  text: "Text",
  scopes: "Scopes",
  history: "History",
  layers: "Layers",
  filters: "Filters",
  canvas: "Canvas",
  exports: "Exports",
  slots: "Template",
  stickers: "Stickers",
};

export function ProjectPage() {
  const { projectId } = useParams();
  const project = useProjectStore((s) => s.project);
  const loading = useProjectStore((s) => s.loading);
  const loadError = useProjectStore((s) => s.loadError);
  const saveState = useProjectStore((s) => s.saveState);
  const saveError = useProjectStore((s) => s.saveError);
  const serverVersion = useProjectStore((s) => s.serverVersion);
  const undoStack = useProjectStore((s) => s.undoStack);
  const editor = useEditorStore();
  const assets = useAssetsStore((s) => s.byId);
  const assetOrder = useAssetsStore((s) => s.order);
  const loadAssets = useAssetsStore((s) => s.load);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [tabChoice, setTab] = useState<PanelTab | null>(null);
  const photoMode = project?.kind === "photo";
  const mode = usePrefsStore((s) => s.mode);
  const simple = mode === "simple" && !photoMode;
  const hasSlots = project !== null && projectSlots(project).length > 0;
  const location = useLocation();
  const navState = location.state as { assetId?: string; fromTemplate?: boolean } | null;
  const startAsset = navState?.assetId;
  // A photo opens on its layers, a template on its slots, Simple mode on media, Pro on the
  // inspector, until a tab is picked.
  const tab: PanelTab =
    tabChoice ??
    (photoMode
      ? "layers"
      : navState?.fromTemplate === true && hasSlots
        ? "slots"
        : simple
          ? "media"
          : "inspector");
  const layoutRef = useRef({ tab: "inspector" });
  useEffect(() => {
    layoutRef.current.tab = tab;
  });
  const tabs: readonly PanelTab[] = photoMode
    ? ["layers", "inspector", "filters", "canvas", "media", "history"]
    : simple
      ? [
          ...(hasSlots ? (["slots"] as const) : []),
          "media",
          "effects",
          "text",
          "stickers",
          "inspector",
          "exports",
        ]
      : [
          "inspector",
          "media",
          "effects",
          "presets",
          "text",
          ...(hasSlots ? (["slots"] as const) : []),
          "scopes",
          "exports",
          "history",
        ];

  const compositionId = editor.activeCompositionId ?? project?.mainCompositionId ?? null;
  // While an effect or preset is hovered in the browser, the preview shows a copy of the project
  // with it applied; nothing is saved until it is clicked.
  const [previewState, setPreviewState] = useState<{ base: Project; shown: Project } | null>(null);
  // A preview made from an older version of the project (it was edited since) is dropped.
  const previewProject =
    previewState !== null && previewState.base === project ? previewState.shown : null;
  const setPreviewProject = (shown: Project | null, base?: Project) => {
    setPreviewState(shown === null || base === undefined ? null : { base, shown });
  };
  const preview = usePreview(previewProject ?? project, compositionId);
  const {
    attachStage,
    playing,
    diagnostics: previewDiagnostics,
    error: previewError,
    togglePlay,
    seek,
    readScope,
    resetLoudness,
  } = preview;

  const ui = useMemo(
    () => ({
      openPalette: () => {
        setPaletteOpen(true);
      },
      showShortcuts: () => {
        setHelpOpen(true);
      },
      openExport: () => {
        setExportOpen(true);
      },
      resetLoudness,
      openExports: () => {
        setTab("exports");
      },
      showTab: (next: string) => {
        setTab(next as PanelTab);
      },
      applyWorkspace: (layout: { sideTab: string; bottom: "timeline" | "graph" | "mixer" }) => {
        setTab(layout.sideTab as PanelTab);
        useEditorStore.getState().setBottomPanel(layout.bottom);
      },
      currentLayout: () => ({
        sideTab: layoutRef.current.tab,
        bottom: useEditorStore.getState().bottomPanel,
      }),
      togglePlay,
      seek,
    }),
    [togglePlay, seek, resetLoudness],
  );
  const host = useEditingHost(ui);
  useExportEvents(project?.kind === "photo" ? null : (project?.id ?? null));
  useShortcuts(editingActions, host.ctx, host.runAction);

  useEffect(() => {
    void loadAssets("");
  }, [loadAssets]);

  useEffect(() => {
    if (projectId === undefined) return;
    void projectStore.getState().open(projectId);
    return () => {
      void projectStore.getState().saveNow();
      projectStore.getState().close();
      useEditorStore.getState().reset();
    };
  }, [projectId]);

  useEffect(() => {
    if (project !== null && useEditorStore.getState().activeCompositionId === null) {
      useEditorStore.getState().setActiveComposition(project.mainCompositionId);
    }
  }, [project]);

  // Save when the tab is hidden or closed; warn before leaving with unsaved changes.
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === "hidden") void projectStore.getState().saveNow();
    };
    const warn = (event: BeforeUnloadEvent) => {
      if (projectStore.getState().saveState !== "saved") event.preventDefault();
    };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", warn);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", warn);
    };
  }, []);

  const run = useCallback(
    async (id: string, args?: unknown) => {
      const message = await host.run(id, args);
      setNotice(message);
      return message;
    },
    [host],
  );

  // The browser's hover preview: the item's ops applied to a copy of the project (not saved).
  const previewRequest = useRef(0);
  const previewItem = useCallback(
    async (item: BrowserItem | null) => {
      previewRequest.current += 1;
      const request = previewRequest.current;
      const current = projectStore.getState().project;
      if (item === null || current === null || playing) {
        setPreviewProject(null);
        return;
      }
      try {
        const result = await editingActions.execute(item.action.id, host.ctx, item.action.args);
        if (request !== previewRequest.current || result === undefined) return;
        const ops = Array.isArray(result) ? result : [result];
        let next = current;
        for (const op of ops) next = applyOp(next, op).project;
        setPreviewProject(next, current);
      } catch {
        setPreviewProject(null);
      }
    },
    [host.ctx, playing],
  );
  const gestures = useRef(0);
  const commit = useCallback((op: Op, label: string) => {
    gestures.current += 1;
    const coalesceKey = `gesture:${String(gestures.current)}`;
    const result = projectStore.getState().dispatch(op, { label, coalesceKey });
    setNotice(result.ok ? null : result.message);
    if (result.ok) closeMainGaps(coalesceKey);
  }, []);

  const commitField = useCallback((op: Op, coalesceKey: string | undefined) => {
    const result = projectStore
      .getState()
      .dispatch(op, coalesceKey === undefined ? {} : { coalesceKey });
    setNotice(result.ok ? null : result.message);
  }, []);

  const libraryById = useAssetsStore((s) => s.byId);
  // Every .cube the person can use: those already in the project, and ready ones in the library.
  const lutAssets = useMemo<LutAsset[]>(() => {
    const inProject = new Set(project?.assets.map((a) => a.id));
    const own = (project?.assets ?? [])
      .filter((a) => a.kind === "lut")
      .map((a) => ({ id: a.id, name: a.name }));
    const fromLibrary = Object.values(libraryById).flatMap((a) => {
      const asset = toProjectAsset(a);
      return asset?.kind === "lut" && !inProject.has(asset.id)
        ? [{ id: asset.id, name: asset.name, addToProject: asset }]
        : [];
    });
    return [...own, ...fromLibrary];
  }, [project, libraryById]);

  const composition = project?.compositions.find((c) => c.id === compositionId);
  const selectedInfos = useMemo<ClipInfo[]>(() => {
    if (composition === undefined || project === null) return [];
    return editor.selectedClipIds.flatMap((id) => {
      const placed = findPlaced(composition, id);
      return placed === undefined
        ? []
        : [
            {
              clip: placed.clip,
              track: placed.track,
              asset: project.assets.find((a) => a.id === placed.clip.assetId),
            },
          ];
    });
  }, [composition, project, editor.selectedClipIds]);
  const library = assetOrder.map((id) => assets[id]).filter((a) => a?.status === "ready");

  // --- Photo workspace ------------------------------------------------------------------------
  const selectedSingle = selectedInfos.length === 1 ? selectedInfos[0] : undefined;
  const maskBrush = useMaskBrush({
    project,
    composition,
    target: selectedSingle,
    playheadUs: editor.playheadUs,
    brush: editor.brush,
    setOverride: preview.setMaskOverride,
    onError: setNotice,
  });
  // "Edit photo" from the library opens the project with the image to start from.
  const started = useRef(false);
  const hasClips = composition?.tracks.some((t) => t.clips.length > 0) === true;
  useEffect(() => {
    if (started.current || !photoMode || startAsset === undefined || composition === undefined)
      return;
    if (assets[startAsset]?.status !== "ready") return;
    started.current = true;
    if (!hasClips) {
      queueMicrotask(() => {
        void run("timeline.addAssetAtPlayhead", { asset: startAsset });
      });
    }
  }, [photoMode, startAsset, composition, assets, hasClips, run]);
  // The crop box exists while the crop tool is open; it starts as the whole canvas.
  const canvasW = composition?.width ?? 0;
  const canvasH = composition?.height ?? 0;
  useEffect(() => {
    const store = usePhotoStore.getState();
    if (editor.canvasTool === "crop" && canvasW > 0) {
      store.setCrop(fitAspect({ width: canvasW, height: canvasH }, canvasW / canvasH));
      store.setCropAspect(null);
    } else {
      store.setCrop(null);
      store.setStraighten(0);
    }
  }, [editor.canvasTool, canvasW, canvasH]);
  // Leaving the mask brush saves what was painted.
  const flushMask = maskBrush.flush;
  useEffect(() => {
    if (editor.canvasTool !== "maskBrush") void flushMask();
  }, [editor.canvasTool, flushMask]);

  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-100">
      <header className="flex flex-wrap items-center gap-3 border-b border-neutral-800 px-4 py-2">
        <Link to="/" className="text-sm text-sky-400 hover:underline">
          ← Library
        </Link>
        <h1 className="truncate text-base font-semibold" data-testid="project-name">
          {project?.name ?? "Project"}
        </h1>
        <SaveStatus state={saveState} detail={saveError} />
        <div className="ml-auto flex items-center gap-2">
          {!photoMode && (
            <span data-tour="mode">
              <ModeSwitch ctx={host.ctx} onRun={host.runAction} />
            </span>
          )}
          {!simple && <WorkspaceMenu ctx={host.ctx} onRun={host.runAction} photo={photoMode} />}
          <span data-tour="palette">
            <ActionButton
              action={editingActions.get("palette.open")}
              ctx={host.ctx}
              variant="icon"
              onRun={host.runAction}
              className="text-neutral-200 hover:bg-neutral-800"
            />
          </span>
          <span data-tour="export">
            <ActionButton
              action={editingActions.get("export.open")}
              ctx={host.ctx}
              onRun={host.runAction}
              className="text-neutral-200 hover:bg-neutral-800"
            />
          </span>
          <ActionButton
            action={editingActions.get("help.shortcuts")}
            ctx={host.ctx}
            variant="icon"
            onRun={host.runAction}
            className="text-neutral-200 hover:bg-neutral-800"
          />
        </div>
      </header>

      {saveState === "conflict" && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 border-b border-red-900 bg-red-950/60 px-4 py-2 text-sm"
        >
          <span>
            This project was changed somewhere else (version {serverVersion ?? "?"}). Your edits
            here are kept, but not saved yet.
          </span>
          <button
            type="button"
            onClick={() => void projectStore.getState().resolveConflict("reload")}
            className="rounded bg-neutral-800 px-3 py-1 hover:bg-neutral-700"
          >
            Load the other version
          </button>
          <button
            type="button"
            onClick={() => void projectStore.getState().resolveConflict("overwrite")}
            className="rounded bg-red-700 px-3 py-1 hover:bg-red-600"
          >
            Keep mine and save
          </button>
        </div>
      )}

      {loading && <p className="p-4 text-neutral-400">Opening project…</p>}
      {loadError !== null && (
        <p
          role="alert"
          className="m-4 rounded-md border border-red-800 bg-red-950/40 px-3 py-2 text-sm"
        >
          {loadError}{" "}
          <Link to="/" className="underline">
            Back to the library
          </Link>
        </p>
      )}

      {project !== null && composition !== undefined && (
        <>
          {editor.compositionTrail.length > 1 && (
            <nav
              aria-label="Composition path"
              className="flex items-center gap-1 border-b border-neutral-800 px-4 py-1 text-xs"
            >
              {editor.compositionTrail.map((id, i) => {
                const last = i === editor.compositionTrail.length - 1;
                const name = project.compositions.find((c) => c.id === id)?.name ?? id;
                return (
                  <span key={id} className="flex items-center gap-1">
                    {i > 0 && <span className="text-neutral-600">›</span>}
                    {last ? (
                      <span aria-current="page" className="font-semibold text-neutral-100">
                        {name}
                      </span>
                    ) : (
                      <button
                        type="button"
                        title={`Go back to ${name}`}
                        onClick={() => {
                          editor.closeComposition(id);
                        }}
                        className="text-sky-400 hover:underline"
                      >
                        {name}
                      </button>
                    )}
                  </span>
                );
              })}
            </nav>
          )}
          <div className="flex min-h-0 flex-1 gap-3 p-3">
            <section
              aria-label="Preview"
              data-tour="preview"
              className="flex min-w-0 flex-1 flex-col gap-2"
            >
              {(notice !== null || previewError !== null) && (
                <p
                  role="alert"
                  className="rounded-md border border-amber-700/60 bg-amber-950/40 px-3 py-1.5 text-sm"
                >
                  {notice ?? previewError}
                </p>
              )}
              {simple && <SimpleBar ctx={host.ctx} onRun={host.runAction} hasSlots={hasSlots} />}
              {photoMode && (
                <>
                  <ToolOptions
                    canvasTool={editor.canvasTool}
                    canvas={{ width: composition.width, height: composition.height }}
                    brush={editor.brush}
                    selection={editor.selection}
                    hasLayer={selectedSingle?.track?.kind === "visual"}
                    setBrush={editor.setBrush}
                    run={run}
                  />
                  <div className="flex min-h-0 flex-1 gap-2">
                    <ToolRail
                      ctx={host.ctx}
                      canvasTool={editor.canvasTool}
                      onRun={host.runAction}
                    />
                    <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-neutral-800">
                      <PhotoStage
                        project={project}
                        composition={composition}
                        selected={selectedInfos}
                        preview={preview}
                        run={run}
                        onCommit={commitField}
                        maskBrush={maskBrush}
                      />
                    </div>
                  </div>
                </>
              )}
              {!photoMode && (
                <div className="relative min-h-0 flex-1 rounded-lg bg-black">
                  <div ref={attachStage} data-testid="preview" className="absolute inset-0" />
                  <PreviewOverlay
                    project={project}
                    composition={composition}
                    selected={selectedInfos}
                    playheadUs={editor.playheadUs}
                    canvasTool={editor.canvasTool}
                    penMode={editor.penMode}
                    onCommit={commitField}
                    onRun={(id, args) => void run(id, args)}
                    onSelectClips={editor.selectClips}
                  />
                </div>
              )}
              {previewDiagnostics.length > 0 && (
                <ul
                  aria-label="Not shown in the preview"
                  className="max-h-16 overflow-y-auto text-xs text-amber-300"
                >
                  {previewDiagnostics.map((d) => (
                    <li key={`${d.clipId ?? "-"}:${d.code}`}>
                      <span className="font-mono">{d.code}</span> — {d.message}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <aside
              aria-label="Side panel"
              className="flex w-80 shrink-0 flex-col overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900/60"
            >
              <div
                role="tablist"
                data-tour="panels"
                aria-label="Panels"
                className="flex overflow-x-auto border-b border-neutral-800 text-xs"
              >
                {tabs.map((id) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    title={TAB_HINT[id]}
                    aria-selected={tab === id}
                    onMouseDown={(event) => {
                      event.preventDefault();
                    }}
                    onClick={() => {
                      setTab(id);
                    }}
                    className={`shrink-0 whitespace-nowrap px-2.5 py-2 ${tab === id ? "border-b-2 border-sky-400 text-neutral-100" : "text-neutral-400 hover:text-neutral-200"}`}
                  >
                    {id === "media" && photoMode ? "Images" : TAB_LABEL[id]}
                  </button>
                ))}
              </div>
              <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto">
                {tab === "inspector" && (
                  <Inspector
                    composition={composition}
                    items={selectedInfos}
                    playheadUs={editor.playheadUs}
                    lutAssets={lutAssets}
                    project={project}
                    onChange={commitField}
                    simple={simple}
                    onShowAdvanced={() => {
                      usePrefsStore.getState().setMode("pro");
                    }}
                  />
                )}
                {tab === "slots" && (
                  <SlotsPanel
                    project={project}
                    library={library.filter((a) => a !== undefined)}
                    run={run}
                    selectClips={editor.selectClips}
                    onUpload={() => {
                      setTab("media");
                    }}
                  />
                )}
                {tab === "stickers" && <StickersPanel run={(id, args) => void run(id, args)} />}
                {tab === "layers" && photoMode && (
                  <LayersPanel
                    composition={composition}
                    ctx={host.ctx}
                    selectedClipIds={editor.selectedClipIds}
                    selectClips={editor.selectClips}
                    onRun={host.runAction}
                    run={run}
                    onAddImage={() => {
                      setTab("media");
                    }}
                  />
                )}
                {tab === "filters" && (
                  <FiltersPanel
                    canAdd={selectedInfos.some((i) => i.track?.kind === "visual")}
                    run={run}
                  />
                )}
                {tab === "canvas" && photoMode && (
                  <CanvasPanel
                    canvas={{ width: composition.width, height: composition.height }}
                    run={run}
                  />
                )}
                {tab === "effects" && (
                  <>
                    <div className="flex flex-wrap gap-1 px-3 pt-3">
                      <ActionButton
                        action={editingActions.get("layer.addAdjustment")}
                        ctx={host.ctx}
                        onRun={host.runAction}
                        className="text-xs text-neutral-300 hover:bg-neutral-800"
                      />
                      <ActionButton
                        action={editingActions.get("layer.addSolid")}
                        ctx={host.ctx}
                        onRun={host.runAction}
                        className="text-xs text-neutral-300 hover:bg-neutral-800"
                      />
                    </div>
                    <Browser
                      kinds={BROWSER_KINDS}
                      canApply={(item) => editingActions.get(item.action.id).when(host.ctx)}
                      onApply={(item) => {
                        setPreviewProject(null);
                        void run(item.action.id, item.action.args);
                      }}
                      onPreview={(item) => {
                        void previewItem(item);
                      }}
                    />
                  </>
                )}
                {tab === "presets" && (
                  <PresetsBrowser
                    canApply={selectedInfos.some((i) => i.track?.kind === "visual")}
                    hasText={selectedInfos.some(
                      (i) => i.clip.type === "text" || i.clip.type === "caption",
                    )}
                    run={(id, args) => run(id, args)}
                  />
                )}
                {tab === "text" && (
                  <TextBrowser
                    hasCaption={selectedInfos.some((i) => i.clip.type === "caption")}
                    run={(id, args) => run(id, args)}
                  />
                )}
                {tab === "scopes" && (
                  <ScopesPanel
                    readScope={readScope}
                    playheadUs={editor.playheadUs}
                    project={project}
                    playing={playing}
                  />
                )}
                {tab === "media" && (
                  <section aria-label="Add media" className="p-3">
                    <h2 className="mb-2 text-sm font-semibold">
                      {photoMode ? "Add an image as a new layer" : "Add media at the playhead"}
                    </h2>
                    {library.length === 0 ? (
                      <p className="text-xs text-neutral-500">
                        No ready assets. Upload some in the library.
                      </p>
                    ) : (
                      <ul className="flex flex-col gap-1">
                        {library.map((asset) =>
                          asset === undefined ? null : (
                            <li key={asset.id} className="flex items-center gap-2 text-xs">
                              <Icon name={asset.kind ?? "file"} />
                              <span className="min-w-0 flex-1 truncate">{asset.name}</span>
                              <button
                                type="button"
                                aria-label={`Add ${asset.name} at the playhead`}
                                onMouseDown={(event) => {
                                  event.preventDefault();
                                }}
                                onClick={() =>
                                  void run("timeline.addAssetAtPlayhead", { asset: asset.id })
                                }
                                className="rounded bg-sky-600 px-2 py-0.5 text-white hover:bg-sky-500"
                              >
                                Add
                              </button>
                            </li>
                          ),
                        )}
                      </ul>
                    )}
                  </section>
                )}
                {tab === "exports" && (
                  <ExportsPanel
                    run={run}
                    onRemove={(id) => {
                      void deleteServerExport(id).catch((e: unknown) => {
                        setNotice(e instanceof Error ? e.message : String(e));
                      });
                    }}
                  />
                )}
                {tab === "history" && (
                  <section aria-label="History" className="p-3">
                    <h2 className="mb-2 text-sm font-semibold">History</h2>
                    {undoStack.length === 0 ? (
                      <p className="text-xs text-neutral-500">No edits yet.</p>
                    ) : (
                      <ol
                        className="flex flex-col-reverse gap-0.5 text-xs text-neutral-300"
                        data-testid="history"
                      >
                        {undoStack.map((entry, i) => (
                          <li key={`${String(i)}-${String(entry.at)}`}>{entry.label}</li>
                        ))}
                      </ol>
                    )}
                  </section>
                )}
              </div>
              <p className="border-t border-neutral-800 p-2 text-[11px] text-neutral-500">
                {photoMode
                  ? "Mod+K: every command · Alt+B brush · Alt+R select · Alt+C crop · Space: hand · [ ]: brush size · ?: all shortcuts"
                  : "Mod+K: every command · V C B N Y U: tools · Space: play · S: split · Mod+C / V: copy and paste · ?: all shortcuts"}
              </p>
            </aside>
          </div>

          {!photoMode && (
            <>
              <Toolbar
                simple={simple}
                ctx={host.ctx}
                tool={editor.tool}
                snapping={editor.snapping}
                playing={playing}
                playheadUs={editor.playheadUs}
                fps={composition.fps}
                onRun={host.runAction}
              />
              {!simple && (
                <div
                  role="tablist"
                  aria-label="Bottom panel"
                  className="flex shrink-0 gap-1 border-t border-neutral-800 bg-neutral-950 px-3 pt-1 text-xs"
                >
                  {(
                    [
                      ["timeline", "Timeline", "panel.showTimeline"],
                      ["graph", "Graph editor", "panel.showGraph"],
                      ["mixer", "Mixer", "panel.showMixer"],
                    ] as const
                  ).map(([id, title, action]) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={editor.bottomPanel === id}
                      title={`${title}: ${editingActions.get(action).description} (${editingActions.get(action).shortcut ?? ""})`}
                      onMouseDown={(event) => {
                        event.preventDefault();
                      }}
                      onClick={() => void run(action)}
                      className={`rounded-t px-3 py-1 ${editor.bottomPanel === id ? "bg-neutral-800 text-neutral-100" : "text-neutral-400 hover:text-neutral-200"}`}
                    >
                      {title}
                    </button>
                  ))}
                </div>
              )}
              {!simple && editor.bottomPanel === "mixer" ? (
                <div className="h-[38vh] min-h-48 shrink-0 border-t border-neutral-800">
                  <MixerPanel
                    composition={composition}
                    ctx={host.ctx}
                    playing={playing}
                    readMeters={preview.meters}
                    previewLevel={preview.previewLevel}
                    resetLoudness={resetLoudness}
                    onRunAction={host.runAction}
                    run={run}
                  />
                </div>
              ) : !simple && editor.bottomPanel === "graph" ? (
                <div className="h-[38vh] min-h-48 shrink-0 border-t border-neutral-800">
                  <GraphEditor
                    clip={selectedInfos.length === 1 ? selectedInfos[0]?.clip : undefined}
                    playheadUs={editor.playheadUs}
                    onChange={commitField}
                    onSeek={seek}
                  />
                </div>
              ) : (
                <ActionContextMenu
                  registry={editingActions}
                  ctx={host.ctx}
                  onRun={(id) => void run(id)}
                >
                  <div className="h-[38vh] min-h-48 shrink-0 border-t border-neutral-800">
                    <Timeline
                      project={project}
                      composition={composition}
                      ctx={host.ctx}
                      tool={editor.tool}
                      zoomPxPerSec={editor.zoomPxPerSec}
                      scrollUs={editor.scrollUs}
                      snapping={editor.snapping}
                      playheadUs={editor.playheadUs}
                      playing={playing}
                      selectedClipIds={editor.selectedClipIds}
                      selectedTrackId={editor.selectedTrackId}
                      newId={newId}
                      onSelectClips={editor.selectClips}
                      onSelectTrack={editor.selectTrack}
                      onSeek={seek}
                      onCommit={commit}
                      onRunAction={host.runAction}
                      onZoom={(zoom, scroll) => {
                        editor.setZoom(zoom);
                        editor.setScroll(scroll);
                      }}
                      onScroll={editor.setScroll}
                      onViewport={editor.setViewportPx}
                    />
                  </div>
                </ActionContextMenu>
              )}
            </>
          )}
        </>
      )}

      <CommandPalette
        extras={paletteExtras}
        registry={editingActions}
        ctx={host.ctx}
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        run={run}
      />
      <ShortcutHelp registry={editingActions} open={helpOpen} onOpenChange={setHelpOpen} />
      {project !== null && !loading && <Tour />}
      {composition !== undefined && (
        <ExportDialog
          open={exportOpen}
          onOpenChange={setExportOpen}
          canvas={{ width: composition.width, height: composition.height }}
          frame={!photoMode}
          run={run}
        />
      )}
    </div>
  );
}
