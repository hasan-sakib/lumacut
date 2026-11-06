import { create } from "zustand";

/** Transient editor state that isn't part of the project document: what is selected and where the playhead is. */
interface EditorState {
  activeCompositionId: string | null;
  selectedClipIds: string[];
  selectedTrackId: string | null;
  playheadUs: number;
  setActiveComposition: (id: string | null) => void;
  selectClips: (ids: string[]) => void;
  selectTrack: (id: string | null) => void;
  setPlayhead: (us: number) => void;
  reset: () => void;
}

const INITIAL = {
  activeCompositionId: null,
  selectedClipIds: [] as string[],
  selectedTrackId: null,
  playheadUs: 0,
};

export const useEditorStore = create<EditorState>()((set) => ({
  ...INITIAL,
  setActiveComposition: (id) => {
    set({ activeCompositionId: id, selectedClipIds: [], selectedTrackId: null, playheadUs: 0 });
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
  reset: () => {
    set({ ...INITIAL, selectedClipIds: [] });
  },
}));
