import { create } from "zustand";

/** A loudness measured offline (exact), shown in the mixer. */
export interface MeasuredLoudness {
  integrated: number;
  truePeak: number;
  shortTermMax: number;
  momentaryMax: number;
}

interface AudioState {
  measured: MeasuredLoudness | null;
  /** The loudness target the mixer shows against (LUFS). */
  target: number;
  setMeasured: (report: MeasuredLoudness | null) => void;
  setTarget: (lufs: number) => void;
}

export const useAudioStore = create<AudioState>()((set) => ({
  measured: null,
  target: -14,
  setMeasured: (measured) => {
    set({ measured });
  },
  setTarget: (target) => {
    set({ target });
  },
}));
