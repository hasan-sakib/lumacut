import { describe, expect, it } from "vitest";
import {
  Clip,
  Composition,
  Project,
  Track,
  centeredTransform,
  createClip,
  createComposition,
  createProject,
  createTrack,
  neutralColor,
} from "../src/index.ts";

const NOW = "2026-11-02T00:00:00.000Z";

describe("factories", () => {
  it("build documents that pass the schema", () => {
    const clip = createClip({ id: "c1", type: "media", assetId: "a1", outUs: 5_000_000 });
    const track = createTrack({ id: "v1", kind: "visual", clips: [clip] });
    const comp = createComposition({ id: "main", width: 1920, height: 1080, tracks: [track] });
    const project = createProject({ id: "p1", now: NOW, compositions: [comp] });
    expect(Clip.safeParse(clip).success).toBe(true);
    expect(Track.safeParse(track).success).toBe(true);
    expect(Composition.safeParse(comp).success).toBe(true);
    expect(Project.safeParse(project).error?.issues).toBeUndefined();
    expect(project.mainCompositionId).toBe("main");
    expect(project.meta.createdAt).toBe(NOW);
  });

  it("let callers override any default, including nested objects", () => {
    const clip = createClip({
      id: "c1",
      type: "text",
      startUs: 2_000_000,
      speed: 2,
      opacity: 0.5,
      blendMode: "screen",
    });
    expect(clip).toMatchObject({ startUs: 2_000_000, speed: 2, opacity: 0.5, blendMode: "screen" });
    expect(clip.transform.scaleX).toBe(1);
  });

  it("don't share mutable defaults between calls", () => {
    const a = createClip({ id: "a", type: "solid" });
    const b = createClip({ id: "b", type: "solid" });
    a.masks.push(
      // not a valid mask on purpose: only identity of the array matters here
      undefined as never,
    );
    expect(b.masks).toHaveLength(0);
    expect(a.color).not.toBe(b.color);
    expect(neutralColor()).not.toBe(neutralColor());
  });

  it("center a layer in a composition", () => {
    const t = centeredTransform({ width: 1920, height: 1080 }, { width: 1280, height: 720 });
    expect(t).toMatchObject({ x: 960, y: 540, anchorX: 640, anchorY: 360, scaleX: 1, rotation: 0 });
  });

  it("never read the clock or randomness", () => {
    const first = createProject({ id: "p", now: NOW });
    const second = createProject({ id: "p", now: NOW });
    expect(second).toStrictEqual(first);
  });
});
