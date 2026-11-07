import { describe, expect, it, vi } from "vitest";
import type { AssetOut } from "../api/client.ts";
import { AssetUnavailableError, URL_TTL_MS, createAssetResolver, pickUrl } from "./resolver.ts";

function asset(over: Partial<AssetOut> = {}): AssetOut {
  return {
    id: "a1",
    kind: "video",
    name: "clip.mp4",
    mimeType: "video/mp4",
    sizeBytes: 1,
    status: "ready",
    stage: null,
    progress: 1,
    errorCode: null,
    errorMessage: null,
    attempts: 1,
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
    readyAt: "2026-11-01T00:00:00Z",
    media: null,
    urls: {
      thumbSheets: [],
      proxy: "https://s3/proxy.mp4?sig=1",
      normalized: "https://s3/normalized.png?sig=1",
    },
    ...over,
  };
}

describe("pickUrl", () => {
  it("reads video and audio from the proxy and images from the normalized copy", () => {
    const a = asset();
    expect(pickUrl(a, "video")).toBe("https://s3/proxy.mp4?sig=1");
    expect(pickUrl(a, "audio")).toBe("https://s3/proxy.mp4?sig=1");
    expect(pickUrl(a, "image")).toBe("https://s3/normalized.png?sig=1");
    expect(pickUrl({ ...a, urls: { ...a.urls, lut: "https://s3/lut.cube?sig=1" } }, "lut")).toBe(
      "https://s3/lut.cube?sig=1",
    );
  });

  it("explains an asset that isn't ready or lacks the rendition", () => {
    expect(() => pickUrl(asset({ status: "processing" }), "video")).toThrow(
      /isn't ready yet \(processing\)/,
    );
    expect(() => pickUrl(asset({ urls: { thumbSheets: [] } }), "image")).toThrow(
      AssetUnavailableError,
    );
  });
});

describe("createAssetResolver", () => {
  it("asks the API once per asset while the URLs are fresh, then again after they age", async () => {
    let clock = 1_000;
    const fetchAsset = vi.fn(() => Promise.resolve(asset()));
    const resolver = createAssetResolver({ fetchAsset, now: () => clock });
    await resolver.resolve("a1", "video");
    await resolver.resolve("a1", "audio");
    await Promise.all([resolver.resolve("a1", "video"), resolver.resolve("a1", "video")]);
    expect(fetchAsset).toHaveBeenCalledTimes(1);
    clock += URL_TTL_MS;
    await resolver.resolve("a1", "video");
    expect(fetchAsset).toHaveBeenCalledTimes(2);
  });

  it("invalidate forces a fresh lookup", async () => {
    const fetchAsset = vi.fn(() => Promise.resolve(asset()));
    const resolver = createAssetResolver({ fetchAsset });
    await resolver.resolve("a1", "video");
    resolver.invalidate("a1");
    await resolver.resolve("a1", "video");
    expect(fetchAsset).toHaveBeenCalledTimes(2);
  });

  it("doesn't remember a failed lookup", async () => {
    const fetchAsset = vi
      .fn<(id: string) => Promise<AssetOut>>()
      .mockRejectedValueOnce(new AssetUnavailableError("offline"))
      .mockResolvedValue(asset());
    const resolver = createAssetResolver({ fetchAsset });
    await expect(resolver.resolve("a1", "video")).rejects.toThrow("offline");
    await expect(resolver.resolve("a1", "video")).resolves.toContain("proxy.mp4");
  });
});
