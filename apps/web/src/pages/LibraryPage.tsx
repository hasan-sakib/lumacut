import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { instantiateTemplate } from "@lumacut/templates";
import {
  libraryActions,
  type HomeSection,
  type LibraryContext,
  type LibraryServices,
} from "../actions/library.ts";
import { useShortcuts } from "../actions/useShortcuts.ts";
import { createProject } from "../api/projects.ts";
import { deleteSavedTemplate, listSavedTemplates, type SavedTemplate } from "../api/templates.ts";
import { ActionButton } from "../components/ActionButton.tsx";
import { HomeView } from "../components/home/HomeView.tsx";
import { NewProjectDialog } from "../components/home/NewProjectDialog.tsx";
import { ProjectDeleteDialog } from "../components/home/ProjectDeleteDialog.tsx";
import { ProjectsView } from "../components/home/ProjectsView.tsx";
import { Sidebar } from "../components/home/Sidebar.tsx";
import { TopBar } from "../components/home/TopBar.tsx";
import { useProjects } from "../components/home/useProjects.ts";
import { Icon } from "../components/Icon.tsx";
import { AssetGrid, AssetTable } from "../components/library/AssetViews.tsx";
import { DeleteDialog } from "../components/library/DeleteDialog.tsx";
import { UploadsPanel } from "../components/library/UploadsPanel.tsx";
import { galleryItems, TemplateGallery } from "../components/templates/TemplateGallery.tsx";
import { droppedFiles, pickFiles, pickWithInput } from "../lib/files.ts";
import { newId } from "../lib/ids.ts";
import { applyAssetMessage } from "../lib/asset-events.ts";
import { connectSse } from "../lib/sse.ts";
import { useAssetsStore } from "../stores/assets.ts";
import { useAuthStore } from "../stores/auth.ts";
import { usePrefsStore } from "../stores/prefs.ts";
import { useUiStore } from "../stores/ui.ts";
import { entryForAsset, useUploadsStore } from "../stores/uploads.ts";
import { currentTheme } from "../theme/useThemeSync.ts";

const SEARCH_DEBOUNCE_MS = 250;
const FEATURED_TEMPLATES = 6;

const SECTION: Record<HomeSection, { title: string; subtitle: string; search: string }> = {
  home: {
    title: "Home",
    subtitle: "Start something new or pick up where you left off.",
    search: "Search projects",
  },
  projects: {
    title: "Projects",
    subtitle: "Open, search and manage everything you've made.",
    search: "Search projects",
  },
  templates: {
    title: "Templates",
    subtitle: "Start from a finished design and make it yours.",
    search: "Search templates",
  },
  media: {
    title: "Media",
    subtitle: "Your uploaded videos, audio and images.",
    search: "Search media",
  },
};

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
      onMessage: applyAssetMessage,
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
  const [section, setSection] = useState<HomeSection>("home");
  const [queries, setQueries] = useState({ projects: "", templates: "", media: query });
  const search = queries.media;
  const theme = usePrefsStore((s) => s.theme);
  const projectList = useProjects();
  const [newOpen, setNewOpen] = useState(false);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const navigate = useNavigate();
  const searchRef = useRef<HTMLInputElement>(null);
  const [savedTemplates, setSavedTemplates] = useState<SavedTemplate[]>([]);
  const [templateBusy, setTemplateBusy] = useState<string | null>(null);
  const savedRef = useRef<SavedTemplate[]>([]);
  useEffect(() => {
    savedRef.current = savedTemplates;
  }, [savedTemplates]);
  useEffect(() => {
    listSavedTemplates().then(setSavedTemplates, () => undefined);
  }, []);
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
      async createVideo(width, height) {
        try {
          void navigate(
            `/project/${await createProject("Untitled video", "video", { width, height })}`,
          );
        } catch (e) {
          setNotice(e instanceof Error ? e.message : "Couldn't create the project.");
        }
      },
      async useTemplate(key) {
        setTemplateBusy(key);
        try {
          const item = galleryItems(savedRef.current).find((i) => i.key === key);
          if (item === undefined) throw new Error("That template doesn't exist.");
          const doc = instantiateTemplate(item.build(), key, newId);
          const id = await createProject(item.name, "video", { doc });
          usePrefsStore.getState().setMode("simple");
          usePrefsStore.getState().completeStep("template");
          void navigate(`/project/${id}`, { state: { fromTemplate: true } });
        } catch (e) {
          setNotice(e instanceof Error ? e.message : "Couldn't start from that template.");
        } finally {
          setTemplateBusy(null);
        }
      },
      async deleteTemplate(id) {
        try {
          await deleteSavedTemplate(id);
          setSavedTemplates((list) => list.filter((t) => t.id !== id));
        } catch (e) {
          setNotice(e instanceof Error ? e.message : "Couldn't remove the template.");
        }
      },
      async createPhoto({ width, height, assetId }) {
        try {
          const id = await createProject("Untitled photo", "photo", { width, height });
          void navigate(`/project/${id}`, assetId === undefined ? {} : { state: { assetId } });
        } catch (e) {
          setNotice(e instanceof Error ? e.message : "Couldn't create the project.");
        }
      },
      chooseNewProject() {
        setNewOpen(true);
      },
      showSection(next) {
        setSection(next);
      },
      openProject(projectId) {
        void navigate(`/project/${projectId}`);
      },
      askDeleteProject(projectId) {
        setDeletingProjectId(projectId);
      },
      setTheme(next) {
        usePrefsStore.getState().setTheme(next);
      },
      toggleTheme() {
        usePrefsStore.getState().setTheme(currentTheme() === "light" ? "dark" : "light");
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
  const deletingProject = projectList.projects?.find((p) => p.id === deletingProjectId) ?? null;
  const ViewComponent = view === "grid" ? AssetGrid : AssetTable;
  const run = (actionId: string, args?: unknown) => {
    void libraryActions.execute(actionId, ctx, args);
  };
  const meta = SECTION[section];
  const searchValue = section === "home" ? "" : queries[section];
  const onSearch = (value: string) => {
    // Searching from Home looks through your projects.
    const target = section === "home" ? "projects" : section;
    if (section === "home" && value !== "") setSection("projects");
    setQueries((q) => ({ ...q, [target]: value }));
  };
  const gallery = (limit?: number) => (
    <TemplateGallery
      saved={savedTemplates}
      busy={templateBusy}
      {...(limit === undefined ? { query: queries.templates } : { limit })}
      onUse={(item) => {
        run("template.use", { template: item.key });
      }}
      onDelete={(item) => {
        run("template.delete", { template: item.key });
      }}
    />
  );

  return (
    <div
      className="flex h-screen overflow-hidden"
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
      <Sidebar
        section={section}
        theme={theme}
        email={user?.email ?? null}
        counts={{ projects: projectList.projects?.length ?? 0, media: assets.length }}
        run={run}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          title={meta.title}
          subtitle={meta.subtitle}
          search={searchValue}
          searchLabel={meta.search}
          searchRef={searchRef}
          onSearch={onSearch}
        >
          {section === "media" && (
            <>
              <ActionButton
                action={libraryActions.get("library.toggleView")}
                ctx={ctx}
                variant="icon"
                className="h-9 text-neutral-300 hover:bg-neutral-800"
              />
              <ActionButton
                action={libraryActions.get("project.newPhotoFromImage")}
                ctx={ctx}
                className="h-9 border border-neutral-800 text-neutral-200 hover:bg-neutral-800"
              />
            </>
          )}
          <ActionButton
            action={libraryActions.get("library.upload")}
            ctx={ctx}
            className="h-9 border border-neutral-700 bg-neutral-900 text-neutral-100 hover:bg-neutral-800"
          />
        </TopBar>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-[90rem] flex-col gap-6 px-6 py-7 lg:px-8">
            {notice && (
              <p
                role="status"
                className="flex items-center gap-3 rounded-xl border border-amber-700/60 bg-amber-950/40 px-4 py-2.5 text-sm"
              >
                <span className="flex-1">{notice}</span>
                <button
                  type="button"
                  aria-label="Dismiss this message"
                  title="Dismiss"
                  onClick={() => {
                    setNotice(null);
                  }}
                  className="rounded-md p-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
                >
                  <Icon name="cancel" className="h-3.5 w-3.5" />
                </button>
              </p>
            )}

            {section === "home" && (
              <HomeView
                projects={projectList.projects}
                projectsError={projectList.error}
                now={projectList.loadedAt}
                run={run}
                templates={gallery(FEATURED_TEMPLATES)}
              />
            )}

            {section === "projects" && (
              <ProjectsView
                projects={projectList.projects}
                error={projectList.error}
                now={projectList.loadedAt}
                query={queries.projects}
                run={run}
              />
            )}

            {section === "templates" && gallery()}

            {section === "media" &&
              (error ? (
                <div
                  role="alert"
                  className="rounded-xl border border-red-800 bg-red-950/40 p-4 text-sm"
                >
                  {error}{" "}
                  <button type="button" className="underline" onClick={() => void load()}>
                    Try again
                  </button>
                </div>
              ) : assets.length === 0 && !loading ? (
                <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-neutral-700 px-6 py-16 text-center">
                  {query.trim() ? (
                    <p className="text-neutral-400">No assets match “{query.trim()}”.</p>
                  ) : (
                    <>
                      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-sky-500/10 text-sky-500">
                        <Icon name="upload" className="h-7 w-7" />
                      </span>
                      <p className="text-base font-semibold">Your library is empty.</p>
                      <p className="max-w-sm text-sm text-neutral-500">
                        Upload videos, audio or images, or drop files anywhere on this page.
                      </p>
                      <ActionButton
                        action={libraryActions.get("library.upload")}
                        ctx={ctx}
                        className="mt-2 h-9 bg-sky-600 px-4 text-white hover:bg-sky-500"
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
              ))}
          </div>
        </main>
      </div>

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-sky-950/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-sky-500 bg-neutral-900 px-12 py-10 shadow-2xl">
            <Icon name="upload" className="h-10 w-10 text-sky-500" />
            <p className="text-lg font-semibold">Drop files to upload</p>
          </div>
        </div>
      )}
      <UploadsPanel entries={Object.values(uploads)} ctx={ctx} />
      <NewProjectDialog
        open={newOpen}
        onClose={() => {
          setNewOpen(false);
        }}
        run={run}
        onPhotoFromImage={() => {
          setSection("media");
          setNotice("Select an image, then choose “Edit photo” at the top.");
        }}
      />
      <ProjectDeleteDialog
        project={deletingProject}
        onCancel={() => {
          setDeletingProjectId(null);
        }}
        onConfirm={async (project) => {
          const message = await projectList.remove(project.id);
          if (message === null) setDeletingProjectId(null);
          return message;
        }}
      />
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
