import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_PX_PER_SEC, MAX_PX_PER_SEC, MIN_PX_PER_SEC } from "../timeline/geometry.ts";
import { useEditorStore } from "./editor.ts";

const s = () => useEditorStore.getState();

beforeEach(() => {
  s().reset();
});

describe("editor store", () => {
  it("starts with the selection tool, snapping on, default zoom", () => {
    expect(s()).toMatchObject({ tool: "select", snapping: true, zoomPxPerSec: DEFAULT_PX_PER_SEC, playheadUs: 0, scrollUs: 0 });
  });

  it("keeps the playhead and scroll whole and non-negative", () => {
    s().setPlayhead(-5);
    expect(s().playheadUs).toBe(0);
    s().setPlayhead(1_234_567.6);
    expect(s().playheadUs).toBe(1_234_568);
    s().setScroll(-100);
    expect(s().scrollUs).toBe(0);
    s().setViewportPx(-3);
    expect(s().viewportPx).toBe(0);
  });

  it("clamps the zoom", () => {
    s().setZoom(1e9);
    expect(s().zoomPxPerSec).toBe(MAX_PX_PER_SEC);
    s().setZoom(0);
    expect(s().zoomPxPerSec).toBe(MIN_PX_PER_SEC);
  });

  it("changing the composition clears selection, playhead and scroll", () => {
    s().selectClips(["a"]);
    s().selectTrack("t");
    s().setPlayhead(5);
    s().setScroll(9);
    s().setActiveComposition("main");
    expect(s()).toMatchObject({ activeCompositionId: "main", selectedClipIds: [], selectedTrackId: null, playheadUs: 0, scrollUs: 0 });
  });

  it("holds a clipboard and a copied look, and reset empties them", () => {
    s().setClipboard({ clips: [], originUs: 0 });
    s().setAttributes({ picture: { opacity: 0.5 }, audio: {} });
    expect(s().clipboard).not.toBeNull();
    expect(s().attributes?.picture).toEqual({ opacity: 0.5 });
    s().reset();
    expect(s().clipboard).toBeNull();
    expect(s().attributes).toBeNull();
  });

  it("reset restores everything, including the tool", () => {
    s().setTool("razor");
    s().setSnapping(false);
    s().setZoom(500);
    s().reset();
    expect(s()).toMatchObject({ tool: "select", snapping: true, zoomPxPerSec: DEFAULT_PX_PER_SEC });
  });
});
