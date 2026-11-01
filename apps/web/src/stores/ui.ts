import { create } from "zustand";

export type ViewMode = "grid" | "list";
const VIEW_KEY = "lumacut.library.view";

function storedView(): ViewMode {
  try {
    return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

interface UiState {
  view: ViewMode;
  selectedId: string | null;
  /** Asset waiting for delete confirmation. */
  confirmDeleteId: string | null;
  setView: (view: ViewMode) => void;
  select: (id: string | null) => void;
  askDelete: (id: string | null) => void;
}

export const useUiStore = create<UiState>()((set) => ({
  view: storedView(),
  selectedId: null,
  confirmDeleteId: null,
  setView(view) {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      // Storage unavailable (private mode): the choice just isn't remembered.
    }
    set({ view });
  },
  select(id) {
    set({ selectedId: id });
  },
  askDelete(id) {
    set({ confirmDeleteId: id });
  },
}));
