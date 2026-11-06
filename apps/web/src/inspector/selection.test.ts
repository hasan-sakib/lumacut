import { createClip, createComposition, createProject, createTrack, type Asset, type Project } from "@lumacut/schema";
import { describe, expect, it } from "vitest";
import { fieldById, type ClipInfo } from "./fields.ts";
import { buildInspector, opForField, opsForField } from "./selection.ts";

const SEC = 1_000_000;
const video: Asset = {
  id: "v1",
  kind: "video",
  name: "clip.mp4",
  mimeType: "video/mp4",
  sizeBytes: 1,
  source: "user",
  video: { width: 1920, height: 1080, fps: { num: 30, den: 1 }, durationUs: 10 * SEC, codec: "avc1" },
};

function infos(): { pic1: ClipInfo; pic2: ClipInfo; snd: ClipInfo; project: Project } {
  const project = createProject({
    id: "p",
    now: "2026-11-06T00:00:00Z",
    assets: [video],
    compositions: [
      createComposition({
        id: "main",
        width: 1920,
        height: 1080,
        tracks: [
          createTrack({
            id: "V1",
            kind: "visual",
            clips: [
              createClip({ id: "a", type: "media", assetId: "v1", startUs: 0, outUs: 2 * SEC, opacity: 0.5 }),
              createClip({ id: "b", type: "media", assetId: "v1", startUs: 2 * SEC, outUs: 2 * SEC, opacity: 1 }),
            ],
          }),
          createTrack({ id: "A1", kind: "audio", clips: [createClip({ id: "s", type: "media", assetId: "v1", startUs: 0, outUs: 2 * SEC })] }),
        ],
      }),
    ],
    mainCompositionId: "main",
  });
  const tracks = project.compositions[0]?.tracks ?? [];
  const at = (t: number, c: number): ClipInfo => ({ clip: tracks[t]!.clips[c]!, track: tracks[t], asset: video });
  return { pic1: at(0, 0), pic2: at(0, 1), snd: at(1, 0), project };
}

const sectionIds = (q = "", adv: Record<string, boolean> = {}, items: ClipInfo[] = []) =>
  buildInspector(items, { query: q, showAdvanced: adv }).map((s) => s.id);

describe("buildInspector", () => {
  it("shows only the sections that apply to the selection", () => {
    const { pic1, snd } = infos();
    expect(sectionIds("", {}, [pic1])).toEqual(["transform", "blend", "crop", "time"]);
    expect(sectionIds("", {}, [snd])).toEqual(["time", "audio"]);
    expect(sectionIds("", {}, [])).toEqual([]);
  });

  it("hides advanced fields until the section's switch is on, and counts them", () => {
    const { pic1 } = infos();
    const basic = buildInspector([pic1], { query: "", showAdvanced: {} });
    const transform = basic.find((s) => s.id === "transform");
    expect(transform?.fields.map((f) => f.def.id)).toEqual(["positionX", "positionY", "scale", "rotation"]);
    expect(transform?.hasAdvanced).toBe(true);
    expect(transform?.hiddenAdvanced).toBe(5); // scaleX, scaleY, anchorX, anchorY, skew
    const adv = buildInspector([pic1], { query: "", showAdvanced: { transform: true } });
    expect(adv.find((s) => s.id === "transform")?.fields.map((f) => f.def.id)).toContain("skew");
    expect(adv.find((s) => s.id === "transform")?.hiddenAdvanced).toBe(0);
  });

  it("search matches label, keywords and section, ignores the advanced switch, and drops empty sections", () => {
    const { pic1 } = infos();
    const ids = (q: string) => buildInspector([pic1], { query: q, showAdvanced: {} }).flatMap((s) => s.fields.map((f) => f.def.id));
    expect(ids("slant")).toEqual(["skew"]); // keyword of an advanced field
    expect(ids("transparency")).toEqual(["opacity"]);
    expect(ids("crop left")).toEqual(["cropLeft"]);
    expect(ids("CROP")).toEqual(["cropLeft", "cropTop", "cropRight", "cropBottom"]);
    expect(ids("nothing like this")).toEqual([]);
    expect(buildInspector([pic1], { query: "slant", showAdvanced: {} })).toHaveLength(1);
  });

  it("marks fields mixed when the selection disagrees, and shares the value when it doesn't", () => {
    const { pic1, pic2 } = infos();
    const sections = buildInspector([pic1, pic2], { query: "", showAdvanced: {} });
    const fields = Object.fromEntries(sections.flatMap((s) => s.fields).map((f) => [f.def.id, f]));
    expect(fields.opacity).toMatchObject({ mixed: true, value: undefined, count: 2 });
    expect(fields.rotation).toMatchObject({ mixed: false, value: 0, count: 2 });
  });

  it("a field applies to the clips it can, and counts only those", () => {
    const { pic1, snd } = infos();
    const sections = buildInspector([pic1, snd], { query: "", showAdvanced: {} });
    const fields = Object.fromEntries(sections.flatMap((s) => s.fields).map((f) => [f.def.id, f]));
    expect(fields.opacity?.count).toBe(1);
    expect(fields.volume?.count).toBe(1);
    expect(fields.speed?.count).toBe(2);
  });
});

describe("opsForField", () => {
  it("makes one setProps per clip that needs the change, and skips clips already there and read-only fields", () => {
    const { pic1, pic2, snd } = infos();
    const ops = opsForField(fieldById("opacity"), 1, [pic1, pic2, snd]);
    expect(ops).toEqual([{ type: "setProps", clipId: "a", props: { opacity: 1 } }]); // b is already 1, snd doesn't apply
    expect(opsForField(fieldById("duration"), 5, [pic1])).toEqual([]);
  });

  it("includes unset for fields that remove a property", () => {
    const { pic1 } = infos();
    const frozen = { ...pic1, clip: { ...pic1.clip, freezeAtUs: 0 } };
    expect(opsForField(fieldById("freeze"), false, [frozen])).toEqual([{ type: "setProps", clipId: "a", props: {}, unset: ["freezeAtUs"] }]);
  });

  it("opForField is null when nothing changes, the op itself for one clip, a labelled batch for several", () => {
    const { pic1, pic2 } = infos();
    expect(opForField(fieldById("rotation"), 0, [pic1])).toBeNull();
    expect(opForField(fieldById("rotation"), 10, [pic1])).toMatchObject({ type: "setProps", clipId: "a" });
    const many = opForField(fieldById("rotation"), 10, [pic1, pic2]);
    expect(many).toMatchObject({ type: "batch", label: "Change rotation" });
    expect(many?.type === "batch" ? many.ops : []).toHaveLength(2);
  });
});
