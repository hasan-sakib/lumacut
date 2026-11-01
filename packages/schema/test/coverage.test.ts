import { describe, expect, it } from "vitest";
import {
  AssetKind,
  ClipType,
  OP_TYPES,
  type Clip,
  type KeyframeValue,
  type Op,
  type Project,
} from "../src/index.ts";
import { loadFixtures } from "./fixtures.ts";

// The parity test (TS vs Python) is only as strong as the fixtures, so assert they exercise
// every discriminated variant of the schema.

const projects = loadFixtures("valid", "project").map((c) => c.value as Project);
const ops = loadFixtures("valid", "op").map((c) => c.value as Op);

function flattenOps(list: Op[]): Op[] {
  return list.flatMap((op) => (op.type === "batch" ? [op, ...flattenOps(op.ops)] : [op]));
}

const clips: Clip[] = projects.flatMap((p) =>
  p.compositions.flatMap((c) => c.tracks.flatMap((t) => t.clips)),
);

function keyframeValueKind(value: KeyframeValue): string {
  if (typeof value === "number") return "number";
  if (Array.isArray(value)) return "vec2";
  return "r" in value ? "color" : "bezierPath";
}

describe("fixture coverage", () => {
  it("covers every op type, including nested batches", () => {
    const flat = flattenOps(ops);
    expect(new Set(flat.map((o) => o.type))).toEqual(new Set(OP_TYPES));
    expect(flat.some((o) => o.type === "batch" && o.ops.some((n) => n.type === "batch"))).toBe(
      true,
    );
  });

  it("covers every clip type", () => {
    expect(new Set(clips.map((c) => c.type))).toEqual(new Set(ClipType.options));
  });

  it("covers every mask kind and shape item kind", () => {
    expect(new Set(clips.flatMap((c) => c.masks.map((m) => m.kind)))).toEqual(
      new Set(["path", "raster"]),
    );
    expect(new Set(clips.flatMap((c) => c.shape?.items.map((i) => i.kind) ?? []))).toEqual(
      new Set(["rect", "ellipse", "polygon", "star", "path"]),
    );
  });

  it("covers every keyframe value kind and interpolation", () => {
    const keyframes = clips.flatMap((c) => Object.values(c.keyframes).flat());
    expect(new Set(keyframes.map((k) => keyframeValueKind(k.value)))).toEqual(
      new Set(["number", "vec2", "color", "bezierPath"]),
    );
    expect(new Set(keyframes.map((k) => k.interpolation))).toEqual(
      new Set(["linear", "bezier", "hold"]),
    );
  });

  it("covers every asset kind and project kind", () => {
    expect(new Set(projects.flatMap((p) => p.assets.map((a) => a.kind)))).toEqual(
      new Set(AssetKind.options),
    );
    expect(new Set(projects.map((p) => p.kind))).toEqual(new Set(["video", "motion", "photo"]));
  });
});
