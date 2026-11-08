import { create } from "zustand";

/** The crop box while the crop tool is open, in canvas pixels. */
export interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PhotoToolState {
  /** The crop tool's box (null when the tool isn't open). */
  crop: CropBox | null;
  /** Width ÷ height the crop box is held to, or null for free. */
  cropAspect: number | null;
  /** Tilt (degrees, clockwise) shown by the crop tool's grid and applied by Straighten. */
  straighten: number;
  /** Does the mask brush reveal or hide? */
  maskMode: "reveal" | "hide";
  /** What the mask brush is doing: nothing, painting, or saving its picture to the library. */
  maskStatus: { state: "idle" | "dirty" | "saving" } | { state: "error"; message: string };
  setCrop: (crop: CropBox | null) => void;
  setCropAspect: (aspect: number | null) => void;
  setStraighten: (degrees: number) => void;
  setMaskMode: (mode: "reveal" | "hide") => void;
  setMaskStatus: (status: PhotoToolState["maskStatus"]) => void;
}

/** Transient state of the photo tools (never saved with the project). */
export const usePhotoStore = create<PhotoToolState>()((set) => ({
  crop: null,
  cropAspect: null,
  straighten: 0,
  maskMode: "reveal",
  maskStatus: { state: "idle" },
  setCrop: (crop) => {
    set({ crop });
  },
  setCropAspect: (cropAspect) => {
    set({ cropAspect });
  },
  setStraighten: (straighten) => {
    set({ straighten });
  },
  setMaskMode: (maskMode) => {
    set({ maskMode });
  },
  setMaskStatus: (maskStatus) => {
    set({ maskStatus });
  },
}));
