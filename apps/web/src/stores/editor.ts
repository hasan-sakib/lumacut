import { create } from "zustand";
import type { Attributes, ClipboardData } from "../timeline/clipboard.ts";
import { DEFAULT_PX_PER_SEC, clampZoom } from "../timeline/geometry.ts";

export type Tool = "select" | "razor" | "ripple" | "roll" | "slip" | "slide";

/** Transient editor state that isn't part of the project document: selection, playhead, tool and view. */
interface EditorState {
  activeCompositionId: string | null;
  selectedClipIds: string[];
  selectedTrackId: string | null;
  playheadUs: number;
  tool: Tool;
  /** Timeline zoom in pixels per second. */
  zoomPxPerSec: number;
  /** Time at the left edge of the visible timeline. */
  scrollUs: number;
  /** Width of the visible timeline area (set by the timeline; used for "zoom to fit"). */
  viewportPx: number;
  snapping: boolean;
  /** Copied clips and a copied look (internal: not the system clipboard). */
  clipboard: ClipboardData | null;
  attributes: Attributes | null;
  setActiveComposition: (id: string | null) => void;
  selectClips: (ids: string[]) => void;
  selectTrack: (id: string | null) => void;
  setPlayhead: (us: number) => void;
  setTool: (tool: Tool) => void;
  setZoom: (pxPerSec: number) => void;
  setScroll: (us: number) => void;
  setViewportPx: (px: number) => void;
  setSnapping: (on: boolean) => void;
  setClipboard: (data: ClipboardData | null) => void;
  setAttributes: (attributes: Attributes | null) => void;
  reset: () => void;
}

const INITIAL = {
  activeCompositionId: null,
  selectedClipIds: [] as string[],
  selectedTrackId: null,
  playheadUs: 0,
  tool: "select" as Tool,
  zoomPxPerSec: DEFAULT_PX_PER_SEC,
  scrollUs: 0,
  viewportPx: 0,
  snapping: true,
  clipboard: null as ClipboardData | null,
  attributes: null as Attributes | null,
};

export const useEditorStore = create<EditorState>()((set) => ({
  ...INITIAL,
  setActiveComposition: (id) => {
    set({ activeCompositionId: id, selectedClipIds: [], selectedTrackId: null, playheadUs: 0, scrollUs: 0 });
  },
  selectClips: (ids) => {
    set({ selectedClipIds: ids });
  },
  selectTrack: (id) => {
    set({ selectedTrackId: id });
  },
  setPlayhead: (us) => {
    set({ playheadUs: Math.max(0, Math.round(us)) });
  },
  setTool: (tool) => {
    set({ tool });
  },
  setZoom: (pxPerSec) => {
    set({ zoomPxPerSec: clampZoom(pxPerSec) });
  },
  setScroll: (us) => {
    set({ scrollUs: Math.max(0, Math.round(us)) });
  },
  setViewportPx: (px) => {
    set({ viewportPx: Math.max(0, Math.round(px)) });
  },
  setSnapping: (on) => {
    set({ snapping: on });
  },
  setClipboard: (data) => {
    set({ clipboard: data });
  },
  setAttributes: (attributes) => {
    set({ attributes });
  },
  reset: () => {
    set({ ...INITIAL, selectedClipIds: [] });
  },
}));
