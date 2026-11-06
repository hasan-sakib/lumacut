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
import { useEditingHost } from "../editor/useEditingHost.ts";
import { formatDuration } from "../lib/format.ts";
import { useAssetsStore } from "../stores/assets.ts";
import { useEditorStore } from "../stores/editor.ts";
import { projectStore, useProjectStore } from "../stores/project.ts";

const BUTTONS = ["history.undo", "history.redo", "palette.open"] as const;

/**
 * The editor shell. M3a gives it everything but the timeline: open a project, run any editing
 * action (palette, shortcuts, context menu), undo/redo and autosave, with a plain outline of the
 * tracks and clips to select from. The Pro timeline (M3b) replaces the outline.
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
  const { selectedClipIds, selectedTrackId, playheadUs } = useEditorStore();
  const assets = useAssetsStore((s) => s.byId);
  const assetOrder = useAssetsStore((s) => s.order);
  const loadAssets = useAssetsStore((s) => s.load);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const ui = useMemo(
    () => ({
      openPalette: () => {
        setPaletteOpen(true);
      },
      showShortcuts: () => {
        setHelpOpen(true);
      },
    }),
    [],
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
      const state = projectStore.getState().saveState;
      if (state !== "saved") event.preventDefault();
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

  const composition = project?.compositions.find((c) => c.id === host.ctx.compositionId);
  const library = assetOrder.map((id) => assets[id]).filter((a) => a?.status === "ready");

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b border-neutral-800 bg-neutral-950/95 px-6 py-3 backdrop-blur">
        <Link to="/" className="text-sm text-sky-400 hover:underline">
          ← Library
        </Link>
        <h1 className="truncate text-lg font-semibold" data-testid="project-name">
          {project?.name ?? "Project"}
        </h1>
        <SaveStatus state={saveState} detail={saveError} />
        <div className="ml-auto flex items-center gap-1">
          {BUTTONS.map((id) => (
            <ActionButton key={id} action={editingActions.get(id)} ctx={host.ctx} variant="icon" onRun={host.runAction} className="text-neutral-200 hover:bg-neutral-800" />
          ))}
          <ActionButton action={editingActions.get("help.shortcuts")} ctx={host.ctx} variant="icon" onRun={host.runAction} className="text-neutral-200 hover:bg-neutral-800" />
        </div>
      </header>

      {saveState === "conflict" && (
        <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-red-900 bg-red-950/60 px-6 py-3 text-sm">
          <span>
            This project was changed somewhere else (version {serverVersion ?? "?"}). Your edits here are kept, but not saved yet.
          </span>
          <button type="button" onClick={() => void projectStore.getState().resolveConflict("reload")} className="rounded bg-neutral-800 px-3 py-1 hover:bg-neutral-700">
            Load the other version
          </button>
          <button type="button" onClick={() => void projectStore.getState().resolveConflict("overwrite")} className="rounded bg-red-700 px-3 py-1 hover:bg-red-600">
            Keep mine and save
          </button>
        </div>
      )}

      <main className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {loading && <p className="text-neutral-400">Opening project…</p>}
        {loadError !== null && (
          <p role="alert" className="rounded-md border border-red-800 bg-red-950/40 px-3 py-2 text-sm lg:col-span-2">
            {loadError} <Link to="/" className="underline">Back to the library</Link>
          </p>
        )}
        {project !== null && composition !== undefined && (
          <>
            <section aria-label="Tracks and clips" className="flex min-w-0 flex-col gap-3">
              {notice !== null && (
                <p role="alert" className="rounded-md border border-amber-700/60 bg-amber-950/40 px-3 py-2 text-sm">
                  {notice}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-300">
                <span>
                  {composition.name} · {composition.width}×{composition.height} · {composition.fps.num / composition.fps.den} fps · {formatDuration(composition.durationUs)} · <span data-testid="marker-count">{composition.markers.length}</span> markers
                </span>
                <label className="ml-auto flex items-center gap-2">
                  Playhead (seconds)
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={playheadUs / 1_000_000}
                    onChange={(e) => {
                      useEditorStore.getState().setPlayhead(Number(e.target.value) * 1_000_000);
                    }}
                    className="w-24 rounded border border-neutral-700 bg-neutral-900 px-2 py-1"
                  />
                </label>
              </div>
              <ActionContextMenu registry={editingActions} ctx={host.ctx} onRun={(id) => void run(id)}>
                <div className="flex flex-col gap-2 rounded-lg border border-neutral-800 bg-neutral-900/50 p-3" data-testid="outline">
                  {[...composition.tracks].reverse().map((track) => (
                    <div key={track.id} className="rounded-md border border-neutral-800 p-2">
                      <button
                        type="button"
                        onClick={() => {
                          useEditorStore.getState().selectTrack(track.id === selectedTrackId ? null : track.id);
                        }}
                        aria-pressed={track.id === selectedTrackId}
                        className={`mb-1 flex items-center gap-2 text-sm font-medium ${track.id === selectedTrackId ? "text-sky-300" : "text-neutral-200"}`}
                      >
                        <Icon name={track.kind === "visual" ? "video" : "audio"} />
                        {track.name}
                        <span className="text-xs font-normal text-neutral-500">
                          {[track.muted && "muted", track.solo && "solo", track.locked && "locked", track.hidden && "hidden"].filter(Boolean).join(" · ")}
                        </span>
                      </button>
                      {track.clips.length === 0 ? (
                        <p className="text-xs text-neutral-500">Empty</p>
                      ) : (
                        <ul className="flex flex-wrap gap-1">
                          {track.clips.map((clip) => {
                            const selected = selectedClipIds.includes(clip.id);
                            const asset = project.assets.find((a) => a.id === clip.assetId);
                            return (
                              <li key={clip.id}>
                                <button
                                  type="button"
                                  data-clip={clip.id}
                                  aria-pressed={selected}
                                  onClick={(e) => {
                                    const editor = useEditorStore.getState();
                                    if (e.shiftKey || e.metaKey || e.ctrlKey) {
                                      editor.selectClips(selected ? selectedClipIds.filter((id) => id !== clip.id) : [...selectedClipIds, clip.id]);
                                    } else {
                                      editor.selectClips([clip.id]);
                                    }
                                  }}
                                  className={`rounded border px-2 py-1 text-xs ${selected ? "border-sky-400 bg-sky-900/60" : "border-neutral-700 bg-neutral-800 hover:bg-neutral-700"}`}
                                >
                                  {asset?.name ?? clip.type} · {(clip.startUs / 1_000_000).toFixed(2)}s{clip.linkId ? " 🔗" : ""}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </ActionContextMenu>
              <p className="text-xs text-neutral-500">
                Select clips (Shift/Ctrl-click for several) and a track, set the playhead, then press Mod+K to run any command. Right-click for a menu. The timeline arrives in the next step.
              </p>
            </section>

            <aside className="flex min-w-0 flex-col gap-4">
              <section aria-label="Add media" className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
                <h2 className="mb-2 text-sm font-semibold">Add media at the playhead</h2>
                {library.length === 0 ? (
                  <p className="text-xs text-neutral-500">No ready assets. Upload some in the library.</p>
                ) : (
                  <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
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
                  <ol className="flex max-h-56 flex-col-reverse gap-0.5 overflow-y-auto text-xs text-neutral-300" data-testid="history">
                    {undoStack.map((entry, i) => (
                      <li key={`${String(i)}-${String(entry.at)}`}>{entry.label}</li>
                    ))}
                  </ol>
                )}
              </section>
            </aside>
          </>
        )}
      </main>

      <CommandPalette registry={editingActions} ctx={host.ctx} open={paletteOpen} onOpenChange={setPaletteOpen} run={run} />
      <ShortcutHelp registry={editingActions} open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}
