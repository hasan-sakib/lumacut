import { create } from "zustand";
import {
  DEFAULT_BRUSH,
  FIT_VIEW,
  type BrushSettings,
  type PhotoTool,
  type PhotoView,
  type Selection,
} from "../photo/types.ts";
import type { Attributes, ClipboardData } from "../timeline/clipboard.ts";
import { DEFAULT_PX_PER_SEC, clampZoom } from "../timeline/geometry.ts";

export type BottomPanel = "timeline" | "graph" | "mixer";

/** What the preview canvas does with the pointer: edit the selection, or draw. */
export type CanvasTool = "select" | "pen" | "rect" | "ellipse" | "polygon" | "star" | PhotoTool;
/** What the pen draws: a new shape layer, or a mask on the selected clip. */
export type PenMode = "shape" | "mask";

export type Tool = "select" | "razor" | "ripple" | "roll" | "slip" | "slide";

/** Transient editor state that isn't part of the project document: selection, playhead, tool and view. */
interface EditorState {
  activeCompositionId: string | null;
  /** Compositions opened to get here, outermost first; the last is the active one. */
  compositionTrail: string[];
  selectedClipIds: string[];
  selectedTrackId: string | null;
  playheadUs: number;
  tool: Tool;
  canvasTool: CanvasTool;
  penMode: PenMode;
  /** Photo workspace: brush options, the current selection and where the canvas is on screen. */
  brush: BrushSettings;
  selection: Selection | null;
  photoView: PhotoView;
  /** Size of the photo workspace's canvas area on screen, in pixels (set by the workspace). */
  photoViewport: { width: number; height: number };
  /** Timeline zoom in pixels per second. */
  zoomPxPerSec: number;
  /** Time at the left edge of the visible timeline. */
  scrollUs: number;
  /** Width of the visible timeline area (set by the timeline; used for "zoom to fit"). */
  viewportPx: number;
  snapping: boolean;
  /** What the bottom dock shows: the timeline or the graph editor. */
  bottomPanel: BottomPanel;
  /** Copied clips and a copied look (internal: not the system clipboard). */
  clipboard: ClipboardData | null;
  attributes: Attributes | null;
  setActiveComposition: (id: string | null) => void;
  /** Opens a nested composition for editing (the current one stays in the trail). */
  openComposition: (id: string) => void;
  /** Goes back up one level (or to `levelId` in the trail). */
  closeComposition: (levelId?: string) => void;
  selectClips: (ids: string[]) => void;
  selectTrack: (id: string | null) => void;
  setPlayhead: (us: number) => void;
  setTool: (tool: Tool) => void;
  setCanvasTool: (tool: CanvasTool) => void;
  setPenMode: (mode: PenMode) => void;
  setBrush: (patch: Partial<BrushSettings>) => void;
  setSelection: (selection: Selection | null) => void;
  setPhotoView: (view: PhotoView) => void;
  setPhotoViewport: (size: { width: number; height: number }) => void;
  setZoom: (pxPerSec: number) => void;
  setScroll: (us: number) => void;
  setViewportPx: (px: number) => void;
  setSnapping: (on: boolean) => void;
  setBottomPanel: (panel: BottomPanel) => void;
  setClipboard: (data: ClipboardData | null) => void;
  setAttributes: (attributes: Attributes | null) => void;
  reset: () => void;
}

const INITIAL = {
  activeCompositionId: null,
  compositionTrail: [] as string[],
  selectedClipIds: [] as string[],
  selectedTrackId: null,
  playheadUs: 0,
  tool: "select" as Tool,
  canvasTool: "select" as CanvasTool,
  penMode: "shape" as PenMode,
  brush: DEFAULT_BRUSH,
  selection: null as Selection | null,
  photoView: FIT_VIEW,
  photoViewport: { width: 0, height: 0 },
  zoomPxPerSec: DEFAULT_PX_PER_SEC,
  scrollUs: 0,
  viewportPx: 0,
  snapping: true,
  bottomPanel: "timeline" as BottomPanel,
  clipboard: null as ClipboardData | null,
  attributes: null as Attributes | null,
};

export const useEditorStore = create<EditorState>()((set) => ({
  ...INITIAL,
  openComposition: (id) => {
    set((state) => ({
      activeCompositionId: id,
      compositionTrail: [...state.compositionTrail.filter((c) => c !== id), id],
      selectedClipIds: [],
      selectedTrackId: null,
      playheadUs: 0,
      scrollUs: 0,
    }));
  },
  closeComposition: (levelId) => {
    set((state) => {
      const at =
        levelId === undefined
          ? state.compositionTrail.length - 2
          : state.compositionTrail.indexOf(levelId);
      const trail = at < 0 ? state.compositionTrail : state.compositionTrail.slice(0, at + 1);
      return {
        compositionTrail: trail,
        activeCompositionId: trail[trail.length - 1] ?? state.activeCompositionId,
        selectedClipIds: [],
        selectedTrackId: null,
        playheadUs: 0,
        scrollUs: 0,
      };
    });
  },
  setActiveComposition: (id) => {
    set({
      compositionTrail: id === null ? [] : [id],
      activeCompositionId: id,
      selectedClipIds: [],
      selectedTrackId: null,
      playheadUs: 0,
      scrollUs: 0,
    });
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
  setCanvasTool: (canvasTool) => {
    set({ canvasTool });
  },
  setPenMode: (penMode) => {
    set({ penMode });
  },
  setBrush: (patch) => {
    set((state) => ({ brush: { ...state.brush, ...patch } }));
  },
  setSelection: (selection) => {
    set({ selection });
  },
  setPhotoView: (photoView) => {
    set({ photoView });
  },
  setPhotoViewport: (photoViewport) => {
    set({ photoViewport });
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
  setBottomPanel: (panel) => {
    set({ bottomPanel: panel });
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
