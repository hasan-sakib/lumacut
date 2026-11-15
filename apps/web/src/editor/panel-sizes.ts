import { useSyncExternalStore } from "react";

/** A stored size in px, or null for the default. */
export interface StoredPanelSizes {
  side: number | null;
  dock: number | null;
}

export type PanelName = keyof StoredPanelSizes;

export const SIDE_DEFAULT = 320;
/** How far one "wider / narrower / taller / shorter" step or arrow key moves an edge. */
export const PANEL_STEP = 48;

interface Bounds {
  min: number;
  max: number;
  fallback: number;
}

const clamp = (value: number, { min, max }: Bounds) => Math.min(max, Math.max(min, value));

/** The side panel can take at most a little over half the window, so the preview always shows. */
export function sideBounds(windowWidth: number): Bounds {
  const max = Math.max(240, Math.round(windowWidth * 0.55));
  return { min: 240, max, fallback: Math.min(SIDE_DEFAULT, max) };
}

/** The bottom dock (timeline, graph editor, mixer): 38 % of the window unless resized. */
export function dockBounds(windowHeight: number): Bounds {
  const max = Math.max(160, Math.round(windowHeight * 0.7));
  return {
    min: 160,
    max,
    fallback: clamp(Math.round(windowHeight * 0.38), { min: 192, max, fallback: 0 }),
  };
}

/** The sizes to draw: the stored ones (or the defaults), kept inside what this window allows. */
export function panelSizes(
  stored: StoredPanelSizes,
  windowWidth: number,
  windowHeight: number,
): { side: number; dock: number } {
  const side = sideBounds(windowWidth);
  const dock = dockBounds(windowHeight);
  return {
    side: clamp(stored.side ?? side.fallback, side),
    dock: clamp(stored.dock ?? dock.fallback, dock),
  };
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("resize", onChange);
  return () => {
    window.removeEventListener("resize", onChange);
  };
}

/** The window's inner size, re-read when it is resized. */
export function useWindowSize(): { width: number; height: number } {
  const width = useSyncExternalStore(subscribe, () => window.innerWidth);
  const height = useSyncExternalStore(subscribe, () => window.innerHeight);
  return { width, height };
}
