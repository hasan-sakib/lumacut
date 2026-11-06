import { beforeEach, describe, expect, it } from "vitest";
import type { AssetOut } from "../api/client.ts";
import { usePlayerStore } from "./player.ts";

function asset(id: string, over: Partial<AssetOut> = {}): AssetOut {
  return {
    id,
    kind: "video",
    name: `${id}.mp4`,
    mimeType: "video/mp4",
    sizeBytes: 1,
    status: "ready",
    stage: null,
    progress: 1,
    errorCode: null,
    errorMessage: null,
    attempts: 1,
    createdAt: "2026-11-02T00:00:00Z",
    updatedAt: "2026-11-02T00:00:00Z",
    readyAt: "2026-11-02T00:00:00Z",
    media: {
      video: {
        width: 1920,
        height: 1080,
        fps: { num: 30, den: 1 },
        durationUs: 2_000_000,
        codec: "h264",
      },
    },
    urls: { thumbSheets: [] },
    ...over,
  };
}

const ids = () => usePlayerStore.getState().layers.map((l) => l.id);

describe("player store", () => {
  beforeEach(() => {
    usePlayerStore.setState({ layers: [], selectedId: null, nextLayer: 1 });
  });

  it("adds ready assets on top with sequential ids and selects the new layer", () => {
    const { addAsset } = usePlayerStore.getState();
    expect(addAsset(asset("a"))).toBeNull();
    expect(addAsset(asset("b"))).toBeNull();
    expect(ids()).toEqual(["L1", "L2"]);
    expect(usePlayerStore.getState().selectedId).toBe("L2");
  });

  it("explains why an asset can't be added and changes nothing", () => {
    const message = usePlayerStore.getState().addAsset(asset("a", { status: "processing" }));
    expect(message).toMatch(/can't be placed/);
    expect(ids()).toEqual([]);
  });

  it("updates one layer's properties without touching others", () => {
    const s = usePlayerStore.getState();
    s.addAsset(asset("a"));
    s.addAsset(asset("b"));
    usePlayerStore.getState().updateLayer("L1", { opacity: 0.25, blendMode: "multiply" });
    const [first, second] = usePlayerStore.getState().layers;
    expect(first).toMatchObject({ opacity: 0.25, blendMode: "multiply" });
    expect(second).toMatchObject({ opacity: 1, blendMode: "normal" });
  });

  it("reorders layers and stops at the ends", () => {
    const s = usePlayerStore.getState();
    s.addAsset(asset("a"));
    s.addAsset(asset("b"));
    s.addAsset(asset("c"));
    usePlayerStore.getState().moveLayer("L1", 1);
    expect(ids()).toEqual(["L2", "L1", "L3"]);
    usePlayerStore.getState().moveLayer("L3", 1);
    usePlayerStore.getState().moveLayer("L2", -1);
    expect(ids()).toEqual(["L2", "L1", "L3"]);
  });

  it("removing the selected layer clears the selection", () => {
    const s = usePlayerStore.getState();
    s.addAsset(asset("a"));
    usePlayerStore.getState().removeLayer("L1");
    expect(ids()).toEqual([]);
    expect(usePlayerStore.getState().selectedId).toBeNull();
  });
});
