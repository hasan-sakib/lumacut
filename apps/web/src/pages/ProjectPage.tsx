import type { Op } from "@lumacut/schema";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import { editingActions } from "../actions/editing.ts";
import { useShortcuts } from "../actions/useShortcuts.ts";
import { ActionButton } from "../components/ActionButton.tsx";
import { Icon } from "../components/Icon.tsx";
import { EffectsBrowser } from "../components/effects/EffectsBrowser.tsx";
import { GraphEditor } from "../components/graph/GraphEditor.tsx";
import { CanvasPanel } from "../components/photo/CanvasPanel.tsx";
import { ExportDialog } from "../components/photo/ExportDialog.tsx";
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
import { CommandPalette } from "../components/palette/CommandPalette.tsx";
import { ShortcutHelp } from "../components/palette/ShortcutHelp.tsx";
import { SaveStatus } from "../components/project/SaveStatus.tsx";
import { Timeline } from "../components/timeline/Timeline.tsx";
import { Toolbar } from "../components/timeline/Toolbar.tsx";
import { useEditingHost } from "../editor/useEditingHost.ts";
import { usePreview } from "../editor/usePreview.ts";
import { newId } from "../lib/ids.ts";
import { touchingPrevious } from "../inspector/transition-ops.ts";
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
  const [tabChoice, setTab] = useState<
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
    | null
  >(null);
  const photoMode = project?.kind === "photo";
  // A photo opens on its layers, a video on the inspector, until a tab is picked.
  const tab = tabChoice ?? (photoMode ? "layers" : "inspector");
  const startAsset = (useLocation().state as { assetId?: string } | null)?.assetId;

  const compositionId = editor.activeCompositionId ?? project?.mainCompositionId ?? null;
  const preview = usePreview(project, compositionId);
  const {
    attachStage,
    playing,
    diagnostics: previewDiagnostics,
    error: previewError,
    togglePlay,
    seek,
    readScope,
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
      togglePlay,
      seek,
    }),
    [togglePlay, seek],
  );
  const host = useEditingHost(ui);
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

  const commit = useCallback((op: Op, label: string) => {
    const result = projectStore.getState().dispatch(op, { label });
    setNotice(result.ok ? null : result.message);
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
        <div className="ml-auto flex items-center gap-1">
          <ActionButton
            action={editingActions.get("export.open")}
            ctx={host.ctx}
            onRun={host.runAction}
            className="text-neutral-200 hover:bg-neutral-800"
          />
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
            <section aria-label="Preview" className="flex min-w-0 flex-1 flex-col gap-2">
              {(notice !== null || previewError !== null) && (
                <p
                  role="alert"
                  className="rounded-md border border-amber-700/60 bg-amber-950/40 px-3 py-1.5 text-sm"
                >
                  {notice ?? previewError}
                </p>
              )}
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
                aria-label="Panels"
                className="flex border-b border-neutral-800 text-xs"
              >
                {(photoMode
                  ? (["layers", "inspector", "filters", "canvas", "media", "history"] as const)
                  : ([
                      "inspector",
                      "media",
                      "effects",
                      "presets",
                      "text",
                      "scopes",
                      "history",
                    ] as const)
                ).map((id) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={tab === id}
                    onMouseDown={(event) => {
                      event.preventDefault();
                    }}
                    onClick={() => {
                      setTab(id);
                    }}
                    className={`flex-1 px-3 py-2 capitalize ${tab === id ? "border-b-2 border-sky-400 text-neutral-100" : "text-neutral-400 hover:text-neutral-200"}`}
                  >
                    {id === "media"
                      ? photoMode
                        ? "Images"
                        : "Add media"
                      : id === "inspector" && photoMode
                        ? "Properties"
                        : id}
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
                  />
                )}
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
                {tab === "filters" && photoMode && (
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
                  <EffectsBrowser
                    canAdd={selectedInfos.some((i) => i.track?.kind !== "audio")}
                    canTransition={selectedInfos.some(
                      (i) =>
                        i.track !== undefined && touchingPrevious(i.track, i.clip) !== undefined,
                    )}
                    run={(id, args) => void run(id, args)}
                  />
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
                ctx={host.ctx}
                tool={editor.tool}
                snapping={editor.snapping}
                playing={playing}
                playheadUs={editor.playheadUs}
                fps={composition.fps}
                onRun={host.runAction}
              />
              <div
                role="tablist"
                aria-label="Bottom panel"
                className="flex shrink-0 gap-1 border-t border-neutral-800 bg-neutral-950 px-3 pt-1 text-xs"
              >
                {(
                  [
                    ["timeline", "Timeline", "panel.showTimeline"],
                    ["graph", "Graph editor", "panel.showGraph"],
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
              {editor.bottomPanel === "graph" ? (
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
        registry={editingActions}
        ctx={host.ctx}
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        run={run}
      />
      <ShortcutHelp registry={editingActions} open={helpOpen} onOpenChange={setHelpOpen} />
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
