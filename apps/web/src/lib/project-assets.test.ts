import { Asset } from "@lumacut/schema";
import { describe, expect, it } from "vitest";
import type { AssetOut } from "../api/client.ts";
import { newId } from "./ids.ts";
import { resolveAssetQuery, toProjectAsset } from "./project-assets.ts";

function out(over: Partial<AssetOut>): AssetOut {
  return {
    id: "a1",
    kind: "video",
    name: "clip.mp4",
    mimeType: "video/mp4",
    sizeBytes: 10,
    status: "ready",
    stage: null,
    progress: 1,
    errorCode: null,
    errorMessage: null,
    attempts: 1,
    createdAt: "2026-11-06T00:00:00Z",
    updatedAt: "2026-11-06T00:00:00Z",
    readyAt: "2026-11-06T00:00:00Z",
    media: {
      video: { width: 1920, height: 1080, fps: { num: 30, den: 1 }, durationUs: 5_000_000, codec: "h264" },
      audio: { sampleRate: 48000, channels: 2, durationUs: 5_000_000, codec: "aac" },
    },
    urls: { thumbSheets: [] },
    ...over,
  };
}

describe("toProjectAsset", () => {
  it("maps video (with sound), audio and image to valid project assets", () => {
    const video = toProjectAsset(out({}));
    expect(video).toMatchObject({ id: "a1", kind: "video", source: "user", video: { width: 1920 }, audio: { channels: 2 } });
    const audio = toProjectAsset(out({ kind: "audio", media: { audio: { sampleRate: 48000, channels: 1, durationUs: 1, codec: "aac" } } }));
    expect(audio?.kind).toBe("audio");
    const image = toProjectAsset(out({ kind: "image", media: { image: { width: 10, height: 20 } } }));
    expect(image?.image).toEqual({ width: 10, height: 20 });
    for (const a of [video, audio, image]) expect(Asset.safeParse(a).success).toBe(true);
  });

  it("is null while the asset isn't usable", () => {
    expect(toProjectAsset(out({ status: "processing" }))).toBeNull();
    expect(toProjectAsset(out({ media: null }))).toBeNull();
    expect(toProjectAsset(out({ kind: null }))).toBeNull();
    expect(toProjectAsset(out({ kind: "image", media: { video: null } }))).toBeNull();
  });
});

describe("newId", () => {
  it("makes 21-character ids that satisfy the schema's Id pattern and don't repeat", () => {
    const ids = Array.from({ length: 200 }, newId);
    expect(new Set(ids).size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]{21}$/);
  });
});

describe("resolveAssetQuery", () => {
  const library = [
    out({ id: "id-one", name: "Beach sunset.mp4" }),
    out({ id: "id-two", name: "Beach walk.mp4" }),
    out({ id: "id-three", name: "City.mp4" }),
    out({ id: "id-four", name: "Pending.mp4", status: "processing" }),
  ];

  it("finds an asset by id, exact name, or a unique part of its name, ignoring case", () => {
    expect(resolveAssetQuery(library, "id-three")).toMatchObject({ asset: { id: "id-three" } });
    expect(resolveAssetQuery(library, "city.mp4")).toMatchObject({ asset: { id: "id-three" } });
    expect(resolveAssetQuery(library, "SUNSET")).toMatchObject({ asset: { id: "id-one" } });
    expect(resolveAssetQuery(library, "  walk ")).toMatchObject({ asset: { id: "id-two" } });
  });

  it("an exact name wins over longer names that contain it", () => {
    const more = [...library, out({ id: "id-five", name: "City.mp4 (copy)" })];
    expect(resolveAssetQuery(more, "City.mp4")).toMatchObject({ asset: { id: "id-three" } });
  });

  it("refuses to guess: ambiguous, missing, not ready and empty queries explain themselves", () => {
    const ambiguous = resolveAssetQuery(library, "beach");
    expect(ambiguous).toMatchObject({ error: expect.stringMatching(/matches 2 assets.*Beach sunset.*Beach walk/) });
    expect(resolveAssetQuery(library, "zebra")).toEqual({ error: "No ready asset matches “zebra”." });
    expect(resolveAssetQuery(library, "pending")).toMatchObject({ error: expect.stringMatching(/No ready asset/) });
    expect(resolveAssetQuery(library, "  ")).toMatchObject({ error: expect.stringMatching(/Say which asset/) });
  });
});
