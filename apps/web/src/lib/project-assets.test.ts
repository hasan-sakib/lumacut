import { Asset } from "@lumacut/schema";
import { describe, expect, it } from "vitest";
import type { AssetOut } from "../api/client.ts";
import { newId } from "./ids.ts";
import { toProjectAsset } from "./project-assets.ts";

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
