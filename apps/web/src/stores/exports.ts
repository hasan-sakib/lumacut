import { create } from "zustand";
import { getServerExport, listServerExports, type ServerExport } from "../export/server.ts";

/** SSE payload; mirrors lumacut_core.events.ExportStateEvent. */
export interface ExportStateEvent {
  exportId: string;
  projectId: string;
  status: ServerExport["status"];
  progress: number;
  errorMessage: string | null;
  deleted: boolean;
}

/** A browser export in progress (only one at a time). */
export interface BrowserExportState {
  label: string;
  phase: "sound" | "picture";
  done: number;
  total: number;
  cancel: () => void;
}

interface ExportsState {
  projectId: string | null;
  items: ServerExport[];
  error: string | null;
  browser: BrowserExportState | null;
  load: (projectId: string) => Promise<void>;
  applyEvent: (event: ExportStateEvent) => void;
  upsert: (item: ServerExport) => void;
  setBrowser: (state: BrowserExportState | null) => void;
}

export const useExportsStore = create<ExportsState>()((set, get) => ({
  projectId: null,
  items: [],
  error: null,
  browser: null,
  async load(projectId) {
    set({ projectId });
    try {
      const items = await listServerExports(projectId);
      if (get().projectId === projectId) set({ items, error: null });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },
  applyEvent(event) {
    if (event.projectId !== get().projectId) return;
    if (event.deleted) {
      set((s) => ({ items: s.items.filter((i) => i.id !== event.exportId) }));
      return;
    }
    const known = get().items.find((i) => i.id === event.exportId);
    if (known === undefined || event.status === "done" || event.status === "failed") {
      // New, or finished: fetch the whole record (download link, warnings, size).
      void getServerExport(event.exportId).then(
        (item) => {
          get().upsert(item);
        },
        () => undefined,
      );
      return;
    }
    set((s) => ({
      items: s.items.map((i) =>
        i.id === event.exportId
          ? {
              ...i,
              status: event.status,
              progress: event.progress,
              errorMessage: event.errorMessage,
            }
          : i,
      ),
    }));
  },
  upsert(item) {
    set((s) => {
      const rest = s.items.filter((i) => i.id !== item.id);
      return { items: [item, ...rest].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) };
    });
  },
  setBrowser(browser) {
    set({ browser });
  },
}));
