import { DropdownMenu } from "radix-ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { createProject } from "../api/projects.ts";
import { libraryActions, type LibraryContext, type LibraryServices } from "../actions/library.ts";
import { useShortcuts } from "../actions/useShortcuts.ts";
import { ActionButton } from "../components/ActionButton.tsx";
import { Icon } from "../components/Icon.tsx";
import { AssetGrid, AssetTable } from "../components/library/AssetViews.tsx";
import { DeleteDialog } from "../components/library/DeleteDialog.tsx";
import { ProjectsStrip } from "../components/library/ProjectsStrip.tsx";
import { UploadsPanel } from "../components/library/UploadsPanel.tsx";
import { droppedFiles, pickFiles, pickWithInput } from "../lib/files.ts";
import { connectSse } from "../lib/sse.ts";
import { useAssetsStore, type AssetStateEvent } from "../stores/assets.ts";
import { useAuthStore } from "../stores/auth.ts";
import { useUiStore } from "../stores/ui.ts";
import { entryForAsset, useUploadsStore } from "../stores/uploads.ts";

const SEARCH_DEBOUNCE_MS = 250;

/** Live asset state over SSE; a reconnect reloads the list so nothing is missed. */
function useAssetEvents() {
  useEffect(() => {
    const assets = useAssetsStore.getState();
    const auth = useAuthStore.getState();
    let first = true;
    const connection = connectSse({
      url: "/api/events",
      token: () => useAuthStore.getState().accessToken,
      refreshToken: () => auth.refresh(),
      onOpen: () => {
        if (!first) void assets.load();
        first = false;
      },
      onMessage: (message) => {
        const store = useAssetsStore.getState();
        if (message.event === "snapshot") {
          for (const e of JSON.parse(message.data) as AssetStateEvent[]) store.applyEvent(e);
        } else if (message.event === "asset") {
          store.applyEvent(JSON.parse(message.data) as AssetStateEvent);
        }
      },
    });
    return () => {
      connection.close();
    };
  }, []);
}

export function LibraryPage() {
  const { byId, order, query, loading, error, load, retry, remove } = useAssetsStore();
  const { view, setView, selectedId, select, confirmDeleteId, askDelete } = useUiStore();
  const uploads = useUploadsStore((s) => s.entries);
  const user = useAuthStore((s) => s.user);
  const [search, setSearch] = useState(query);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const navigate = useNavigate();
  const searchRef = useRef<HTMLInputElement>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  const resumeInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void load("");
  }, [load]);
  useAssetEvents();
  useEffect(() => {
    if (search === useAssetsStore.getState().query) return;
    const timer = setTimeout(() => void load(search), SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [search, load]);

  const services: LibraryServices = useMemo(
    () => ({
      async pickAndUpload() {
        if (uploadInput.current === null) return;
        const native = "showOpenFilePicker" in window;
        if (!native) {
          uploadInput.current.click(); // its onChange starts the uploads
          return;
        }
        const picked = await pickFiles(uploadInput.current, true);
        if (picked.length > 0) useUploadsStore.getState().start(picked);
      },
      async createProject() {
        try {
          void navigate(`/project/${await createProject("Untitled project")}`);
        } catch (e) {
          setNotice(e instanceof Error ? e.message : "Couldn't create the project.");
        }
      },
      focusSearch() {
        searchRef.current?.focus();
        searchRef.current?.select();
      },
      setView,
      askDelete,
      async retry(assetId) {
        setNotice(await retry(assetId));
      },
      async resume(assetId) {
        const input = resumeInput.current;
        if (input === null) return;
        const message = await useUploadsStore.getState().resume(assetId, async (name) => {
          setNotice(`Choose “${name}” again to resume its upload.`);
          const [picked] = await pickWithInput(input, false);
          setNotice(null);
          return picked ?? null;
        });
        setNotice(message);
      },
      async cancelUpload(key) {
        await useUploadsStore.getState().cancel(key);
      },
      async logout() {
        await useAuthStore.getState().logout();
      },
    }),
    [setView, askDelete, retry, navigate],
  );

  const assets = order.map((id) => byId[id]).filter((a) => a !== undefined);
  const selected = selectedId ? (byId[selectedId] ?? null) : null;
  const ctx: LibraryContext = {
    asset: selected,
    uploadKey: selected ? (entryForAsset(uploads, selected.id)?.key ?? null) : null,
    view,
    services,
  };
  useShortcuts(libraryActions, ctx);

  const onDrop = useCallback(async (event: React.DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const picked = await droppedFiles(event.dataTransfer);
    if (picked.length > 0) useUploadsStore.getState().start(picked);
  }, []);

  const deleting = confirmDeleteId ? (byId[confirmDeleteId] ?? null) : null;
  const ViewComponent = view === "grid" ? AssetGrid : AssetTable;

  return (
    <div
      className="min-h-screen"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => void onDrop(e)}
    >
      <header className="sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b border-neutral-800 bg-neutral-950/95 px-6 py-3 backdrop-blur">
        <h1 className="mr-4 text-lg font-bold tracking-tight">Lumacut</h1>
        <div className="relative min-w-48 flex-1">
          <Icon name="search" className="absolute left-2.5 top-2.5 h-4 w-4 text-neutral-500" />
          <input
            ref={searchRef}
            type="search"
            value={search}
            aria-label="Search library"
            placeholder="Search by name…  (/)"
            onChange={(e) => {
              setSearch(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") e.currentTarget.blur();
            }}
            className="w-full rounded-md border border-neutral-800 bg-neutral-900 py-2 pl-8 pr-3 text-sm outline-none focus:border-sky-500"
          />
        </div>
        <ActionButton
          action={libraryActions.get("library.toggleView")}
          ctx={ctx}
          variant="icon"
          className="text-neutral-300 hover:bg-neutral-800"
        />
        <ActionButton
          action={libraryActions.get("project.new")}
          ctx={ctx}
          className="text-neutral-200 hover:bg-neutral-800"
        />
        <ActionButton
          action={libraryActions.get("library.upload")}
          ctx={ctx}
          className="bg-sky-600 text-white hover:bg-sky-500"
        />
        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            aria-label="Account menu"
            className="rounded-full bg-neutral-800 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-700"
          >
            {user?.email.slice(0, 1).toUpperCase() ?? "?"}
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={6}
              className="z-50 min-w-48 rounded-md border border-neutral-700 bg-neutral-900 p-1 text-sm shadow-xl"
            >
              <DropdownMenu.Label className="px-2 py-1.5 text-xs text-neutral-400">
                {user?.email}
              </DropdownMenu.Label>
              <DropdownMenu.Item
                onSelect={() => void libraryActions.execute("auth.logout", ctx)}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 outline-none data-[highlighted]:bg-neutral-800"
              >
                <Icon name="logout" /> {libraryActions.get("auth.logout").title}
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </header>

      <main className="px-6 py-6">
        <ProjectsStrip />
        {notice && (
          <p
            role="status"
            className="mb-4 rounded-md border border-amber-700/60 bg-amber-950/40 px-3 py-2 text-sm"
          >
            {notice}
          </p>
        )}
        {error ? (
          <div role="alert" className="rounded-lg border border-red-800 bg-red-950/40 p-4 text-sm">
            {error}{" "}
            <button type="button" className="underline" onClick={() => void load()}>
              Try again
            </button>
          </div>
        ) : assets.length === 0 && !loading ? (
          <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-neutral-700 p-12 text-center">
            {query.trim() ? (
              <p className="text-neutral-400">No assets match “{query.trim()}”.</p>
            ) : (
              <>
                <p className="text-neutral-300">Your library is empty.</p>
                <p className="text-sm text-neutral-500">
                  Upload videos, audio or images, or drop files anywhere on this page.
                </p>
                <ActionButton
                  action={libraryActions.get("library.upload")}
                  ctx={ctx}
                  className="bg-sky-600 text-white hover:bg-sky-500"
                />
              </>
            )}
          </div>
        ) : (
          <ViewComponent
            assets={assets}
            ctx={ctx}
            uploads={uploads}
            selectedId={selectedId}
            onSelect={select}
          />
        )}
      </main>

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-sky-950/70 text-xl font-semibold">
          Drop files to upload
        </div>
      )}
      <UploadsPanel entries={Object.values(uploads)} ctx={ctx} />
      <DeleteDialog
        asset={deleting}
        onCancel={() => {
          askDelete(null);
        }}
        onConfirm={async (asset) => {
          const entry = entryForAsset(uploads, asset.id);
          if (entry) await useUploadsStore.getState().cancel(entry.key);
          const message = entry ? null : await remove(asset.id);
          if (message === null) askDelete(null);
          return message;
        }}
      />
      <input
        ref={uploadInput}
        type="file"
        multiple
        hidden
        data-testid="upload-input"
        aria-hidden="true"
        onChange={(e) => {
          const files = Array.from(e.currentTarget.files ?? [], (file) => ({ file }));
          e.currentTarget.value = "";
          if (files.length > 0) useUploadsStore.getState().start(files);
        }}
      />
      <input ref={resumeInput} type="file" hidden data-testid="resume-input" aria-hidden="true" />
    </div>
  );
}
