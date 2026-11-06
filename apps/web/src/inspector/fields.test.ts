import { applyOp } from "@lumacut/ops";
import { createClip, createComposition, createProject, createTrack, type Asset, type Clip, type Project } from "@lumacut/schema";
import { describe, expect, it } from "vitest";
import { FIELDS, MIN_DB, fieldById, type ClipInfo } from "./fields.ts";

const SEC = 1_000_000;
const video: Asset = {
  id: "v1",
  kind: "video",
  name: "clip.mp4",
  mimeType: "video/mp4",
  sizeBytes: 1,
  source: "user",
  video: { width: 1920, height: 1080, fps: { num: 30, den: 1 }, durationUs: 10 * SEC, codec: "avc1" },
  audio: { sampleRate: 48_000, channels: 2, durationUs: 10 * SEC, codec: "aac" },
};

function project(): Project {
  return createProject({
    id: "p",
    now: "2026-11-06T00:00:00Z",
    assets: [video],
    compositions: [
      createComposition({
        id: "main",
        width: 1920,
        height: 1080,
        durationUs: 4 * SEC,
        tracks: [
          createTrack({ id: "V1", kind: "visual", clips: [createClip({ id: "pic", type: "media", assetId: "v1", startUs: 0, inUs: 1 * SEC, outUs: 3 * SEC })] }),
          createTrack({ id: "A1", kind: "audio", clips: [createClip({ id: "snd", type: "media", assetId: "v1", startUs: 0, inUs: 0, outUs: 2 * SEC })] }),
        ],
      }),
    ],
    mainCompositionId: "main",
  });
}

const infoOf = (p: Project, id: string): ClipInfo => {
  for (const t of p.compositions[0]?.tracks ?? []) {
    const clip = t.clips.find((c) => c.id === id);
    if (clip) return { clip, track: t, asset: p.assets.find((a) => a.id === clip.assetId) };
  }
  throw new Error(id);
};
const clipOf = (p: Project, id: string): Clip => infoOf(p, id).clip;

/** Applies a field edit the way the inspector does and returns the new project. */
function edit(p: Project, fieldId: string, shown: number | string | boolean, clipId: string): Project {
  const def = fieldById(fieldId);
  const info = infoOf(p, clipId);
  const stored = typeof shown === "number" && def.fromDisplay ? def.fromDisplay(shown) : shown;
  const patch = def.set(info.clip, stored);
  return applyOp(p, { type: "setProps", clipId, props: patch.props, ...(patch.unset ? { unset: patch.unset } : {}) }).project;
}

describe("field catalogue", () => {
  it("has unique ids and every field is labelled and searchable", () => {
    const ids = FIELDS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const f of FIELDS) {
      expect(f.label.length).toBeGreaterThan(2);
      expect(f.keywords.length).toBeGreaterThan(0);
    }
  });

  it("picture fields apply to picture clips only, audio fields to audio-track clips only", () => {
    const p = project();
    const pic = infoOf(p, "pic");
    const snd = infoOf(p, "snd");
    expect(fieldById("scale").appliesTo(pic)).toBe(true);
    expect(fieldById("scale").appliesTo(snd)).toBe(false);
    expect(fieldById("volume").appliesTo(snd)).toBe(true);
    expect(fieldById("volume").appliesTo(pic)).toBe(false);
    expect(fieldById("speed").appliesTo(pic)).toBe(true);
    expect(fieldById("duration").appliesTo(snd)).toBe(true);
  });
});

describe("setting a field changes only that field, and the result is a valid clip", () => {
  const p0 = project();

  it("transform", () => {
    let p = edit(p0, "positionX", 120, "pic");
    p = edit(p, "positionY", -40, "pic");
    p = edit(p, "rotation", 15, "pic");
    p = edit(p, "anchorX", 10, "pic");
    p = edit(p, "skew", 5, "pic");
    expect(clipOf(p, "pic").transform).toMatchObject({ x: 120, y: -40, rotation: 15, anchorX: 10, skew: 5, scaleX: 1, scaleY: 1 });
  });

  it("uniform scale sets both axes; X and Y are separate; shown in percent", () => {
    let p = edit(p0, "scale", 150, "pic");
    expect(clipOf(p, "pic").transform).toMatchObject({ scaleX: 1.5, scaleY: 1.5 });
    p = edit(p, "scaleX", 200, "pic");
    expect(clipOf(p, "pic").transform).toMatchObject({ scaleX: 2, scaleY: 1.5 });
    expect(fieldById("scale").toDisplay?.(1.5)).toBe(150);
  });

  it("opacity (percent), blend mode (validated) and crop edges (percent)", () => {
    let p = edit(p0, "opacity", 40, "pic");
    p = edit(p, "blendMode", "multiply", "pic");
    p = edit(p, "cropLeft", 10, "pic");
    p = edit(p, "cropBottom", 25, "pic");
    expect(clipOf(p, "pic")).toMatchObject({ opacity: 0.4, blendMode: "multiply", crop: { left: 0.1, bottom: 0.25, top: 0, right: 0 } });
    expect(() => fieldById("blendMode").set(clipOf(p0, "pic"), "not-a-mode")).toThrow();
  });

  it("speed and reverse", () => {
    const p = edit(edit(p0, "speed", 2, "pic"), "reversed", true, "pic");
    expect(clipOf(p, "pic")).toMatchObject({ speed: 2, reversed: true });
  });

  it("freeze frame sets freezeAtUs to the clip's in point and removes it again", () => {
    const frozen = edit(p0, "freeze", true, "pic");
    expect(clipOf(frozen, "pic").freezeAtUs).toBe(1 * SEC);
    expect(fieldById("freeze").get(clipOf(frozen, "pic"))).toBe(true);
    const thawed = edit(frozen, "freeze", false, "pic");
    expect("freezeAtUs" in clipOf(thawed, "pic")).toBe(false);
  });

  it("audio: volume in dB, pan in percent, fades in seconds; defaults are created on first edit", () => {
    expect(clipOf(p0, "snd").audio).toBeUndefined();
    let p = edit(p0, "volume", -6, "snd");
    p = edit(p, "pan", -50, "snd");
    p = edit(p, "fadeIn", 0.5, "snd");
    p = edit(p, "fadeOut", 1, "snd");
    const audio = clipOf(p, "snd").audio;
    expect(audio?.volume).toBeCloseTo(0.5012, 3);
    expect(audio).toMatchObject({ pan: -0.5, fadeInUs: 500_000, fadeOutUs: 1_000_000 });
  });

  it("read-only fields refuse to set anything", () => {
    for (const id of ["sourceIn", "sourceOut", "duration"]) {
      expect(fieldById(id).readOnly).toBe(true);
      expect(fieldById(id).set(clipOf(p0, "pic"), 5)).toEqual({ props: {} });
    }
  });
});

describe("display conversions", () => {
  it("decibels: unity is 0 dB, silence is the floor, and the conversion round-trips", () => {
    const v = fieldById("volume");
    expect(v.toDisplay?.(1)).toBeCloseTo(0, 6);
    expect(v.toDisplay?.(0)).toBe(MIN_DB);
    expect(v.toDisplay?.(2)).toBeCloseTo(6.0206, 3);
    expect(v.fromDisplay?.(MIN_DB)).toBe(0);
    expect(v.fromDisplay?.(-120)).toBe(0);
    expect(v.fromDisplay?.(0)).toBeCloseTo(1, 6);
    expect(v.fromDisplay?.(v.toDisplay?.(0.25) ?? 0)).toBeCloseTo(0.25, 6);
  });

  it("seconds fields convert whole microseconds both ways", () => {
    const d = fieldById("fadeIn");
    expect(d.toDisplay?.(1_500_000)).toBe(1.5);
    expect(d.fromDisplay?.(0.0000004)).toBe(0);
    expect(d.fromDisplay?.(1.234567)).toBe(1_234_567);
  });
});
