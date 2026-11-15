import { create } from "zustand";
import type { PanelName, StoredPanelSizes } from "../editor/panel-sizes.ts";

/** Which editor layout: Simple (CapCut-like) or Pro. A view choice only: projects don't change. */
export type EditorMode = "simple" | "pro";

/** A browser item someone starred or used: `effect:blur`, `preset:pop`, `look:builtin:teal-orange`… */
export type BrowserKey = string;

/** A saved arrangement of the editor's panels. */
export interface WorkspaceLayout {
  id: string;
  name: string;
  /** The side panel tab shown. */
  sideTab: string;
  /** The bottom dock: timeline, graph editor or mixer. */
  bottom: "timeline" | "graph" | "mixer";
  /** Panel sizes saved with the arrangement (px; null or missing = the default). */
  side?: number | null;
  dock?: number | null;
}

/** Light, dark, or whatever the operating system is set to. */
export type ThemeChoice = "light" | "dark" | "system";

interface Prefs {
  mode: EditorMode;
  theme: ThemeChoice;
  favourites: BrowserKey[];
  recents: BrowserKey[];
  workspace: string;
  savedWorkspaces: WorkspaceLayout[];
  /** The editor's side panel width and bottom dock height (px; null = the default). */
  panelSizes: StoredPanelSizes;
  onboarding: { tourDone: boolean; steps: Record<string, boolean> };
  setPanelSize: (panel: PanelName, px: number | null) => void;
  setPanelSizes: (sizes: StoredPanelSizes) => void;
  setMode: (mode: EditorMode) => void;
  setTheme: (theme: ThemeChoice) => void;
  toggleFavourite: (key: BrowserKey) => void;
  noteUse: (key: BrowserKey) => void;
  setWorkspace: (id: string) => void;
  saveWorkspace: (layout: WorkspaceLayout) => void;
  deleteWorkspace: (id: string) => void;
  finishTour: () => void;
  resetTour: () => void;
  completeStep: (step: string) => void;
}

const KEY = "lumacut.prefs.v1";

type Stored = Pick<
  Prefs,
  | "mode"
  | "theme"
  | "favourites"
  | "recents"
  | "workspace"
  | "savedWorkspaces"
  | "panelSizes"
  | "onboarding"
>;

const DEFAULTS: Stored = {
  mode: "pro",
  theme: "system",
  favourites: [],
  recents: [],
  workspace: "edit",
  savedWorkspaces: [],
  panelSizes: { side: null, dock: null },
  onboarding: { tourDone: false, steps: {} },
};

function load(): Stored {
  try {
    const raw = globalThis.localStorage.getItem(KEY);
    if (raw === null) return DEFAULTS;
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Stored>) };
  } catch {
    return DEFAULTS;
  }
}

function persist(state: Stored): void {
  try {
    const { mode, theme, favourites, recents, workspace, savedWorkspaces, panelSizes, onboarding } =
      state;
    globalThis.localStorage.setItem(
      KEY,
      JSON.stringify({
        mode,
        theme,
        favourites,
        recents,
        workspace,
        savedWorkspaces,
        panelSizes,
        onboarding,
      }),
    );
  } catch {
    // Private mode or storage full: preferences just don't survive a reload.
  }
}

/** Per-browser preferences: mode, favourites and recents, workspaces, onboarding progress. */
export const usePrefsStore = create<Prefs>()((set, get) => {
  const update = (patch: Partial<Stored>) => {
    set(patch);
    persist({ ...get(), ...patch });
  };
  return {
    ...load(),
    setMode: (mode) => {
      update({ mode });
    },
    setPanelSize: (panel, px) => {
      update({ panelSizes: { ...get().panelSizes, [panel]: px } });
    },
    setPanelSizes: (panelSizes) => {
      update({ panelSizes });
    },
    setTheme: (theme) => {
      update({ theme });
    },
    toggleFavourite: (key) => {
      const favourites = get().favourites.includes(key)
        ? get().favourites.filter((k) => k !== key)
        : [key, ...get().favourites];
      update({ favourites });
    },
    noteUse: (key) => {
      update({ recents: [key, ...get().recents.filter((k) => k !== key)].slice(0, 12) });
    },
    setWorkspace: (workspace) => {
      update({ workspace });
    },
    saveWorkspace: (layout) => {
      update({
        savedWorkspaces: [...get().savedWorkspaces.filter((w) => w.id !== layout.id), layout],
        workspace: layout.id,
      });
    },
    deleteWorkspace: (id) => {
      update({
        savedWorkspaces: get().savedWorkspaces.filter((w) => w.id !== id),
        ...(get().workspace === id ? { workspace: "edit" } : {}),
      });
    },
    finishTour: () => {
      update({ onboarding: { ...get().onboarding, tourDone: true } });
    },
    resetTour: () => {
      update({ onboarding: { ...get().onboarding, tourDone: false } });
    },
    completeStep: (step) => {
      if (get().onboarding.steps[step] === true) return;
      update({
        onboarding: { ...get().onboarding, steps: { ...get().onboarding.steps, [step]: true } },
      });
    },
  };
});
