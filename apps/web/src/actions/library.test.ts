import { describe, expect, it, vi } from "vitest";
import type { AssetOut } from "../api/client.ts";
import { libraryActions, type LibraryContext, type LibraryServices } from "./library.ts";

function asset(status: AssetOut["status"]): AssetOut {
  return {
    id: "a1",
    kind: "video",
    name: "clip.mp4",
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

function ctx(partial: Partial<LibraryContext> = {}): LibraryContext {
  const services: LibraryServices = {
    pickAndUpload: vi.fn(() => Promise.resolve()),
    focusSearch: vi.fn(),
    setView: vi.fn(),
    askDelete: vi.fn(),
    retry: vi.fn(() => Promise.resolve()),
    resume: vi.fn(() => Promise.resolve()),
    cancelUpload: vi.fn(() => Promise.resolve()),
    logout: vi.fn(() => Promise.resolve()),
  };
  return { asset: null, uploadKey: null, view: "grid", services, ...partial };
}

const ids = (c: LibraryContext) =>
  libraryActions
    .available(c)
    .map((a) => a.id)
    .sort();

describe("library actions", () => {
  it("are all registered with tooltip metadata and unique shortcuts", () => {
    const all = libraryActions.list();
    expect(all.map((a) => a.id).sort()).toEqual([
      "asset.delete",
      "asset.retry",
      "auth.logout",
      "library.search",
      "library.toggleView",
      "library.upload",
      "upload.cancel",
      "upload.resume",
    ]);
    for (const a of all) expect(a.icon).toBeTruthy();
    const shortcuts = all.flatMap((a) => (a.shortcut ? [a.shortcut] : []));
    expect(new Set(shortcuts).size).toBe(shortcuts.length);
  });

  it("offer per-asset actions only where they make sense", () => {
    expect(ids(ctx())).toEqual([
      "auth.logout",
      "library.search",
      "library.toggleView",
      "library.upload",
    ]);
    expect(ids(ctx({ asset: asset("failed") }))).toContain("asset.retry");
    expect(ids(ctx({ asset: asset("ready") }))).not.toContain("asset.retry");
    expect(ids(ctx({ asset: asset("uploading") }))).toContain("upload.resume");
    const uploadingHere = ids(ctx({ asset: asset("uploading"), uploadKey: "k1" }));
    expect(uploadingHere).toContain("upload.cancel");
    expect(uploadingHere).not.toContain("upload.resume");
  });

  it("run the matching service", () => {
    const c = ctx({ asset: asset("failed"), view: "grid" });
    void libraryActions.execute("asset.retry", c);
    void libraryActions.execute("asset.delete", c);
    void libraryActions.execute("library.toggleView", c);
    expect(c.services.retry).toHaveBeenCalledWith("a1");
    expect(c.services.askDelete).toHaveBeenCalledWith("a1");
    expect(c.services.setView).toHaveBeenCalledWith("list");
  });
});
