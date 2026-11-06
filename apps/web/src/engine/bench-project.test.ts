import { Project, usToFrame } from "@lumacut/schema";
import { validateProject } from "@lumacut/engine";
import { describe, expect, it } from "vitest";
import type { AssetOut } from "../api/client.ts";
import {
  IMAGE_DURATION_US,
  buildBenchProject,
  layerFromAsset,
  type BenchLayer,
} from "./bench-project.ts";

const NOW = "2026-11-02T00:00:00Z";

function asset(over: Partial<AssetOut>): AssetOut {
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
    createdAt: NOW,
    updatedAt: NOW,
    readyAt: NOW,
    media: {
      video: {
        width: 1280,
        height: 720,
        fps: { num: 30, den: 1 },
        durationUs: 4_000_000,
        codec: "h264",
      },
    },
    urls: { thumbSheets: [] },
    ...over,
  };
}

function layer(over: Partial<BenchLayer> = {}): BenchLayer {
  const made = layerFromAsset(asset({}), "L1");
  if (made === null) throw new Error("fixture asset should be placeable");
  return { ...made, ...over };
}

describe("layerFromAsset", () => {
  it("takes size and duration from the probe, defaults to neutral properties", () => {
    expect(layer()).toMatchObject({
      kind: "video",
      width: 1280,
      height: 720,
      durationUs: 4_000_000,
      blendMode: "normal",
      opacity: 1,
      scale: 1,
      audible: true,
    });
  });

  it("gives stills a fixed duration and no sound", () => {
    const image = layerFromAsset(
      asset({ id: "i1", kind: "image", media: { image: { width: 2048, height: 1024 } } }),
      "L2",
    );
    expect(image).toMatchObject({ kind: "image", durationUs: IMAGE_DURATION_US, audible: false });
  });

  it("refuses assets that aren't ready or have no probe data", () => {
    expect(layerFromAsset(asset({ status: "processing" }), "L")).toBeNull();
    expect(layerFromAsset(asset({ media: null }), "L")).toBeNull();
    expect(layerFromAsset(asset({ kind: null }), "L")).toBeNull();
  });
});

describe("buildBenchProject", () => {
  it("builds a schema-valid project the engine accepts", () => {
    const project = buildBenchProject(
      [
        layer(),
        layer({
          id: "L2",
          assetId: "a2",
          kind: "image",
          width: 800,
          height: 600,
          durationUs: IMAGE_DURATION_US,
          audible: false,
          blendMode: "screen",
          opacity: 0.5,
          rotation: 15,
        }),
      ],
      NOW,
    );
    expect(Project.safeParse(project).success).toBe(true);
    expect(() => {
      validateProject(project);
    }).not.toThrow();
  });

  it("stacks pictures bottom to top in layer order and adds an audio track per audible layer", () => {
    const project = buildBenchProject(
      [layer(), layer({ id: "L2", assetId: "a2", audible: false })],
      NOW,
    );
    const tracks = project.compositions[0]?.tracks ?? [];
    expect(tracks.map((t) => `${t.id}:${t.kind}`)).toEqual([
      "L1-v:visual",
      "L2-v:visual",
      "L1-a:audio",
    ]);
  });

  it("centres a layer, applies offset, scale and rotation, and lasts as long as its source", () => {
    const project = buildBenchProject(
      [layer({ scale: 0.5, rotation: 30, offsetX: 100, offsetY: -50 })],
      NOW,
    );
    const comp = project.compositions[0];
    const clip = comp?.tracks[0]?.clips[0];
    expect(clip?.transform).toMatchObject({
      x: 960 + 100,
      y: 540 - 50,
      anchorX: 640,
      anchorY: 360,
      scaleX: 0.5,
      scaleY: 0.5,
      rotation: 30,
    });
    expect(comp?.durationUs).toBe(4_000_000);
    expect(usToFrame(comp?.durationUs ?? 0, comp?.fps ?? { num: 30, den: 1 })).toBe(120);
  });

  it("an audio-only layer yields only an audio track", () => {
    const project = buildBenchProject([layer({ kind: "audio", width: 0, height: 0 })], NOW);
    expect((project.compositions[0]?.tracks ?? []).map((t) => t.kind)).toEqual(["audio"]);
  });
});
