import { create } from "zustand";
import { api, errorMessage, type AssetOut } from "../api/client.ts";

/** SSE payload; mirrors lumacut_core.events.AssetStateEvent. */
export interface AssetStateEvent {
  assetId: string;
  status: AssetOut["status"];
  stage: string | null;
  progress: number;
  errorCode: string | null;
  errorMessage: string | null;
  attempts: number;
  deleted: boolean;
}

interface AssetsState {
  byId: Record<string, AssetOut>;
  order: string[];
  query: string;
  loading: boolean;
  error: string | null;
  load: (query?: string) => Promise<void>;
  fetchOne: (id: string) => Promise<void>;
  applyEvent: (event: AssetStateEvent) => void;
  retry: (id: string) => Promise<string | null>;
  remove: (id: string) => Promise<string | null>;
  forget: (id: string) => void;
}

const TERMINAL = new Set<AssetOut["status"]>(["ready", "failed"]);

export const useAssetsStore = create<AssetsState>()((set, get) => ({
  byId: {},
  order: [],
  query: "",
  loading: false,
  error: null,

  async load(query = get().query) {
    set({ loading: true, query });
    const q = query.trim();
    const { data, error } = await api.GET("/api/assets", {
      params: { query: q ? { q } : {} },
    });
    if (get().query !== query) return; // a newer search superseded this one
    if (data === undefined) {
      set({ loading: false, error: errorMessage(error, "Couldn't load your library.") });
      return;
    }
    set({
      loading: false,
      error: null,
      byId: Object.fromEntries(data.items.map((a) => [a.id, a])),
      order: data.items.map((a) => a.id),
    });
  },

  async fetchOne(id) {
    const { data } = await api.GET("/api/assets/{asset_id}", {
      params: { path: { asset_id: id } },
    });
    if (data === undefined) return;
    set((s) => ({
      byId: { ...s.byId, [id]: data },
      order: s.order.includes(id) ? s.order : [id, ...s.order],
    }));
  },

  applyEvent(event) {
    const known = get().byId[event.assetId];
    if (event.deleted) {
      get().forget(event.assetId);
      return;
    }
    if (known === undefined) {
      // New asset (e.g. uploaded in another tab): show it unless a search is active.
      if (get().query.trim() === "") void get().fetchOne(event.assetId);
      return;
    }
    set((s) => ({
      byId: {
        ...s.byId,
        [event.assetId]: {
          ...known,
          status: event.status,
          stage: event.stage,
          progress: event.progress,
          errorCode: event.errorCode,
          errorMessage: event.errorMessage,
          attempts: event.attempts,
        },
      },
    }));
    // Finished: fetch media info and the presigned rendition URLs.
    if (TERMINAL.has(event.status) && !TERMINAL.has(known.status))
      void get().fetchOne(event.assetId);
  },

  async retry(id) {
    const { data, error } = await api.POST("/api/assets/{asset_id}/retry", {
      params: { path: { asset_id: id } },
    });
    if (data === undefined) return errorMessage(error);
    set((s) => ({ byId: { ...s.byId, [id]: data } }));
    return null;
  },

  async remove(id) {
    const { error, response } = await api.DELETE("/api/assets/{asset_id}", {
      params: { path: { asset_id: id } },
    });
    if (!response.ok && response.status !== 404) return errorMessage(error);
    get().forget(id);
    return null;
  },

  forget(id) {
    set((s) => {
      const { [id]: _gone, ...rest } = s.byId;
      return { byId: rest, order: s.order.filter((x) => x !== id) };
    });
  },
}));
