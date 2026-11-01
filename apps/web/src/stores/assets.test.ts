import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssetOut } from "../api/client.ts";
import { useAssetsStore, type AssetStateEvent } from "./assets.ts";

function asset(id: string, status: AssetOut["status"]): AssetOut {
  return {
    id,
    kind: "video",
    name: `${id}.mp4`,
    mimeType: "video/mp4",
    sizeBytes: 1,
    status,
    stage: null,
    progress: 0,
    errorCode: null,
    errorMessage: null,
    attempts: 1,
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
    readyAt: null,
    media: null,
    urls: { thumbSheets: [] },
  };
}

function event(
  id: string,
  status: AssetOut["status"],
  extra: Partial<AssetStateEvent> = {},
): AssetStateEvent {
  return {
    assetId: id,
    status,
    stage: null,
    progress: 0,
    errorCode: null,
    errorMessage: null,
    attempts: 1,
    deleted: false,
    ...extra,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  useAssetsStore.setState({ byId: {}, order: [], query: "" });
});

describe("assets store events", () => {
  it("merges progress, then fetches the final asset once it is ready", async () => {
    useAssetsStore.setState({ byId: { a1: asset("a1", "queued") }, order: ["a1"] });
    const ready = {
      ...asset("a1", "ready"),
      media: {
        video: { width: 1, height: 1, fps: { num: 30, den: 1 }, durationUs: 5, codec: "h264" },
      },
    };
    const fetchMock = vi.fn(() => Promise.resolve(Response.json(ready)));
    vi.stubGlobal("fetch", fetchMock);

    useAssetsStore
      .getState()
      .applyEvent(event("a1", "processing", { stage: "proxy", progress: 0.4 }));
    expect(useAssetsStore.getState().byId.a1).toMatchObject({
      status: "processing",
      stage: "proxy",
      progress: 0.4,
    });
    expect(fetchMock).not.toHaveBeenCalled();

    useAssetsStore.getState().applyEvent(event("a1", "ready", { progress: 1 }));
    await vi.waitFor(() => {
      expect(useAssetsStore.getState().byId.a1?.media?.video?.durationUs).toBe(5);
    });
  });

  it("removes deleted assets and ignores unknown ones during a search", () => {
    useAssetsStore.setState({ byId: { a1: asset("a1", "ready") }, order: ["a1"], query: "beach" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    useAssetsStore.getState().applyEvent(event("zz", "queued"));
    expect(fetchMock).not.toHaveBeenCalled();
    useAssetsStore.getState().applyEvent(event("a1", "ready", { deleted: true }));
    expect(useAssetsStore.getState().order).toEqual([]);
  });
});
