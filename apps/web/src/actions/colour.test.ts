import { runAction } from "@lumacut/actions";
import { applyOp } from "@lumacut/ops";
import {
  createClip,
  createComposition,
  createProject,
  createTrack,
  neutralColor,
  type Asset,
  type Project,
} from "@lumacut/schema";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "./colour.ts";
import { editingActions, type EditingContext } from "./editing.ts";

const SEC = 1_000_000;
const video: Asset = {
  id: "v1",
  kind: "video",
  name: "clip.mp4",
  mimeType: "video/mp4",
  sizeBytes: 1,
  source: "user",
  video: { width: 1280, height: 720, fps: { num: 30, den: 1 }, durationUs: 4 * SEC, codec: "avc1" },
  audio: { sampleRate: 48_000, channels: 2, durationUs: 4 * SEC, codec: "aac" },
};

let project: Project;
beforeEach(() => {
  const media = (id: string) =>
    createClip({
      id,
      type: "media",
      assetId: "v1",
      outUs: 2 * SEC,
      color: { ...neutralColor(), exposure: 1 },
    });
  project = createProject({
    id: "p",
    now: "2026-11-07T00:00:00Z",
    assets: [video],
    compositions: [
      createComposition({
        id: "main",
        width: 1920,
        height: 1080,
        durationUs: 4 * SEC,
        tracks: [
          createTrack({ id: "V1", kind: "visual", clips: [media("p1")] }),
          createTrack({ id: "A1", kind: "audio", clips: [media("s1")] }),
        ],
      }),
    ],
    mainCompositionId: "main",
  });
});

function ctx(selected: string[]): EditingContext {
  return {
    project,
    compositionId: "main",
    selectedClipIds: selected,
    selectedTrackId: null,
    playheadUs: 0,
    canUndo: false,
    canRedo: false,
    hasClipboard: false,
    hasAttributes: false,
    clipboard: null,
    attributes: null,
    services: {
      newId: () => "n",
      undo: vi.fn(),
      redo: vi.fn(),
      resolveAsset: () => ({ error: "none" }),
      clipboard: { setClips: vi.fn(), setAttributes: vi.fn() },
      openPalette: vi.fn(),
      showShortcuts: vi.fn(),
      playback: { togglePlay: vi.fn(), seek: vi.fn() },
      editor: {
        setTool: vi.fn(),
        zoomBy: vi.fn(),
        zoomFit: vi.fn(),
        toggleSnapping: vi.fn(),
        selectClips: vi.fn(),
        setBottomPanel: vi.fn(),
      },
    },
  };
}
async function perform(id: string, c: EditingContext, args?: unknown) {
  await runAction(editingActions, id, c, args, (op) => {
    project = applyOp(project, op).project;
  });
}
const colorOf = (id: string) =>
  project.compositions[0]?.tracks.flatMap((t) => t.clips).find((c) => c.id === id)?.color;

describe("colour actions", () => {
  it("reset clears the grade on picture clips only", async () => {
    await perform("color.reset", ctx(["p1", "s1"]));
    expect(colorOf("p1")).toEqual(neutralColor());
    expect(colorOf("s1")?.exposure).toBe(1); // sound has no picture to grade
  });

  it("apply a look, then remove it", async () => {
    await perform("color.applyLut", ctx(["p1"]), { look: "builtin:noir", intensity: 60 });
    expect(colorOf("p1")?.lut).toEqual({ lutId: "builtin:noir", intensity: 0.6 });
    expect(colorOf("p1")?.exposure).toBe(1); // the rest of the grade stays
    await perform("color.removeLut", ctx(["p1"]));
    expect(colorOf("p1")?.lut).toBeUndefined();
  });

  it("defaults to full strength and refuses an unknown look", async () => {
    await perform("color.applyLut", ctx(["p1"]), { look: "builtin:vivid" });
    expect(colorOf("p1")?.lut?.intensity).toBe(1);
    await expect(
      perform("color.applyLut", ctx(["p1"]), { look: "builtin:nope" }),
    ).rejects.toThrow();
  });

  it("are unavailable without a picture clip selected", () => {
    expect(editingActions.get("color.reset").when(ctx([]))).toBe(false);
    expect(editingActions.get("color.reset").when(ctx(["s1"]))).toBe(false);
    expect(editingActions.get("color.removeLut").when(ctx(["p1"]))).toBe(false);
  });
});
