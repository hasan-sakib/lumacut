import type { Op } from "@lumacut/schema";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { editingActions } from "../actions/editing.ts";
import { useShortcuts } from "../actions/useShortcuts.ts";
import { ActionButton } from "../components/ActionButton.tsx";
import { Icon } from "../components/Icon.tsx";
import { ActionContextMenu } from "../components/palette/ActionContextMenu.tsx";
import { CommandPalette } from "../components/palette/CommandPalette.tsx";
import { ShortcutHelp } from "../components/palette/ShortcutHelp.tsx";
import { SaveStatus } from "../components/project/SaveStatus.tsx";
import { Timeline } from "../components/timeline/Timeline.tsx";
import { Toolbar } from "../components/timeline/Toolbar.tsx";
import { useEditingHost } from "../editor/useEditingHost.ts";
import { usePreview } from "../editor/usePreview.ts";
import { newId } from "../lib/ids.ts";
import { useAssetsStore } from "../stores/assets.ts";
import { useEditorStore } from "../stores/editor.ts";
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
  const [notice, setNotice] = useState<string | null>(null);

  const compositionId = editor.activeCompositionId ?? project?.mainCompositionId ?? null;
  const preview = usePreview(project, compositionId);
  const { togglePlay, seek } = preview;

  const ui = useMemo(
    () => ({
      openPalette: () => {
        setPaletteOpen(true);
      },
      showShortcuts: () => {
        setHelpOpen(true);
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

  const composition = project?.compositions.find((c) => c.id === compositionId);
  const library = assetOrder.map((id) => assets[id]).filter((a) => a?.status === "ready");

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
          <ActionButton action={editingActions.get("help.shortcuts")} ctx={host.ctx} variant="icon" onRun={host.runAction} className="text-neutral-200 hover:bg-neutral-800" />
        </div>
      </header>

      {saveState === "conflict" && (
        <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-red-900 bg-red-950/60 px-4 py-2 text-sm">
          <span>This project was changed somewhere else (version {serverVersion ?? "?"}). Your edits here are kept, but not saved yet.</span>
          <button type="button" onClick={() => void projectStore.getState().resolveConflict("reload")} className="rounded bg-neutral-800 px-3 py-1 hover:bg-neutral-700">
            Load the other version
          </button>
          <button type="button" onClick={() => void projectStore.getState().resolveConflict("overwrite")} className="rounded bg-red-700 px-3 py-1 hover:bg-red-600">
            Keep mine and save
          </button>
        </div>
      )}

      {loading && <p className="p-4 text-neutral-400">Opening project…</p>}
      {loadError !== null && (
        <p role="alert" className="m-4 rounded-md border border-red-800 bg-red-950/40 px-3 py-2 text-sm">
          {loadError} <Link to="/" className="underline">Back to the library</Link>
        </p>
      )}

      {project !== null && composition !== undefined && (
        <>
          <div className="flex min-h-0 flex-1 gap-3 p-3">
            <section aria-label="Preview" className="flex min-w-0 flex-1 flex-col gap-2">
              {(notice !== null || preview.error !== null) && (
                <p role="alert" className="rounded-md border border-amber-700/60 bg-amber-950/40 px-3 py-1.5 text-sm">
                  {notice ?? preview.error}
                </p>
              )}
              <div ref={preview.stageRef} data-testid="preview" className="min-h-0 flex-1 rounded-lg bg-black" />
              {preview.diagnostics.length > 0 && (
                <ul aria-label="Not shown in the preview" className="max-h-16 overflow-y-auto text-xs text-amber-300">
                  {preview.diagnostics.map((d) => (
                    <li key={`${d.clipId ?? "-"}:${d.code}`}>
                      <span className="font-mono">{d.code}</span> — {d.message}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <aside className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto">
              <section aria-label="Add media" className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
                <h2 className="mb-2 text-sm font-semibold">Add media at the playhead</h2>
                {library.length === 0 ? (
                  <p className="text-xs text-neutral-500">No ready assets. Upload some in the library.</p>
                ) : (
                  <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                    {library.map((asset) =>
                      asset === undefined ? null : (
                        <li key={asset.id} className="flex items-center gap-2 text-xs">
                          <Icon name={asset.kind ?? "file"} />
                          <span className="min-w-0 flex-1 truncate">{asset.name}</span>
                          <button
                            type="button"
                            aria-label={`Add ${asset.name} at the playhead`}
                            onClick={() => void run("timeline.addAssetAtPlayhead", { assetId: asset.id })}
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
              <section aria-label="History" className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
                <h2 className="mb-2 text-sm font-semibold">History</h2>
                {undoStack.length === 0 ? (
                  <p className="text-xs text-neutral-500">No edits yet.</p>
                ) : (
                  <ol className="flex max-h-48 flex-col-reverse gap-0.5 overflow-y-auto text-xs text-neutral-300" data-testid="history">
                    {undoStack.map((entry, i) => (
                      <li key={`${String(i)}-${String(entry.at)}`}>{entry.label}</li>
                    ))}
                  </ol>
                )}
              </section>
              <p className="text-xs text-neutral-500">
                Mod+K opens every command. Tools: V select, C razor, B ripple, N roll, Y slip, U slide. Space plays, S splits at the playhead, ? lists all shortcuts.
              </p>
            </aside>
          </div>

          <Toolbar ctx={host.ctx} tool={editor.tool} snapping={editor.snapping} playing={preview.playing} playheadUs={editor.playheadUs} fps={composition.fps} onRun={host.runAction} />
          <ActionContextMenu registry={editingActions} ctx={host.ctx} onRun={(id) => void run(id)}>
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
                playing={preview.playing}
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
        </>
      )}

      <CommandPalette registry={editingActions} ctx={host.ctx} open={paletteOpen} onOpenChange={setPaletteOpen} run={run} />
      <ShortcutHelp registry={editingActions} open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}
