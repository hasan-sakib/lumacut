import { create } from "zustand";
import type { AssetOut } from "../api/client.ts";
import { layerFromAsset, type BenchLayer } from "../engine/bench-project.ts";

interface PlayerState {
  /** Bottom layer first, like the composition's track order. */
  layers: BenchLayer[];
  selectedId: string | null;
  nextLayer: number;
  /** Adds the asset on top; returns why it couldn't be added, or null. */
  addAsset: (asset: AssetOut) => string | null;
  updateLayer: (id: string, patch: Partial<Omit<BenchLayer, "id" | "assetId">>) => void;
  removeLayer: (id: string) => void;
  /** +1 moves a layer up the stack (drawn later), -1 down. */
  moveLayer: (id: string, direction: 1 | -1) => void;
  select: (id: string | null) => void;
  clear: () => void;
}

export const usePlayerStore = create<PlayerState>()((set, get) => ({
  layers: [],
  selectedId: null,
  nextLayer: 1,

  addAsset(asset) {
    const id = `L${String(get().nextLayer)}`;
    const layer = layerFromAsset(asset, id);
    if (layer === null)
      return `"${asset.name}" can't be placed yet: it isn't ready or has no media info.`;
    set((s) => ({ layers: [...s.layers, layer], selectedId: id, nextLayer: s.nextLayer + 1 }));
    return null;
  },

  updateLayer(id, patch) {
    set((s) => ({ layers: s.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
  },

  removeLayer(id) {
    set((s) => ({
      layers: s.layers.filter((l) => l.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    }));
  },

  moveLayer(id, direction) {
    set((s) => {
      const from = s.layers.findIndex((l) => l.id === id);
      const to = from + direction;
      const layer = s.layers[from];
      const other = s.layers[to];
      if (layer === undefined || other === undefined) return s;
      const layers = [...s.layers];
      layers[from] = other;
      layers[to] = layer;
      return { layers };
    });
  },

  select(id) {
    set({ selectedId: id });
  },

  clear() {
    set({ layers: [], selectedId: null });
  },
}));
