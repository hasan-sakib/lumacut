import { runAction } from "@lumacut/actions";
import { applyOp } from "@lumacut/ops";
import {
  createClip,
  createComposition,
  createProject,
  createTrack,
  type Asset,
  type Clip,
  type Keyframe,
  type Project,
} from "@lumacut/schema";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { editingActions, type EditingContext } from "./editing.ts";
import "./keyframes.ts";

const SEC = 1_000_000;
const video: Asset = {
  id: "v1",
  kind: "video",
  name: "clip.mp4",
  mimeType: "video/mp4",
  sizeBytes: 1,
  source: "user",
  video: {
    width: 1280,
    height: 720,
    fps: { num: 30, den: 1 },
    durationUs: 10 * SEC,
    codec: "avc1",
  },
};
const key = (tUs: number, value: number): Keyframe => ({ tUs, value, interpolation: "linear" });

let project: Project;
const seek = vi.fn<(us: number) => void>();
const setBottomPanel = vi.fn();

function makeProject(extra: Partial<Clip> = {}): Project {
  return createProject({
    id: "p",
    now: "2026-11-07T00:00:00Z",
    assets: [video],
    compositions: [
      createComposition({
        id: "main",
        width: 1920,
        height: 1080,
        durationUs: 10 * SEC,
        tracks: [
          createTrack({
            id: "V1",
            kind: "visual",
            clips: [
              createClip({
                id: "c1",
                type: "media",
                assetId: "v1",
                startUs: 2 * SEC,
                inUs: 0,
                outUs: 4 * SEC,
                ...extra,
              }),
            ],
          }),
        ],
      }),
    ],
    mainCompositionId: "main",
  });
}

function ctx(partial: Partial<EditingContext> = {}): EditingContext {
  return {
    project,
    compositionId: "main",
    selectedClipIds: ["c1"],
    selectedTrackId: null,
    playheadUs: 3 * SEC,
    canUndo: false,
    canRedo: false,
    hasClipboard: false,
    hasAttributes: false,
    clipboard: null,
    attributes: null,
    services: {
      newId: () => "n1",
      undo: vi.fn(),
      redo: vi.fn(),
      resolveAsset: () => ({ error: "none" }),
      clipboard: { setClips: vi.fn(), setAttributes: vi.fn() },
      openPalette: vi.fn(),
      showShortcuts: vi.fn(),
      playback: { togglePlay: vi.fn(), seek },
      editor: {
        setTool: vi.fn(),
        zoomBy: vi.fn(),
        zoomFit: vi.fn(),
        toggleSnapping: vi.fn(),
        selectClips: vi.fn(),
        setBottomPanel,
      },
    },
    ...partial,
  };
}

async function perform(id: string, context: EditingContext, args?: unknown): Promise<void> {
  await runAction(editingActions, id, context, args, (op) => {
    project = applyOp(project, op).project;
  });
}
const clipOf = (): Clip => {
  const clip = project.compositions[0]?.tracks[0]?.clips[0];
  if (clip === undefined) throw new Error("no clip");
  return clip;
};

beforeEach(() => {
  project = makeProject();
  seek.mockClear();
  setBottomPanel.mockClear();
});

describe("keyframe.toggle", () => {
  it("adds a keyframe at the playhead and removes it again", async () => {
    await perform("keyframe.toggle", ctx(), { property: "opacity" });
    expect(clipOf().keyframes.opacity).toEqual([{ tUs: SEC, value: 1, interpolation: "linear" }]);
    await perform("keyframe.toggle", ctx(), { property: "opacity" });
    expect(clipOf().keyframes.opacity).toBeUndefined();
  });

  it("works for a point property through its field id", async () => {
    await perform("keyframe.toggle", ctx(), { property: "positionX" });
    expect(Object.keys(clipOf().keyframes)).toEqual(["transform.position"]);
  });

  it("is only available with the playhead on a selected clip", () => {
    const action = editingActions.get("keyframe.toggle");
    expect(action.when(ctx())).toBe(true);
    expect(action.when(ctx({ playheadUs: 9 * SEC }))).toBe(false);
    expect(action.when(ctx({ selectedClipIds: [] }))).toBe(false);
  });

  it("refuses an unknown property with the list of valid ones", async () => {
    await expect(perform("keyframe.toggle", ctx(), { property: "nonsense" })).rejects.toThrow();
  });
});

describe("keyframe.next and keyframe.previous", () => {
  beforeEach(() => {
    project = makeProject({
      keyframes: { opacity: [key(0, 0), key(SEC, 1), key(3 * SEC, 0.5)] },
    });
  });

  it("jump between the keyframes of the selected clips (timeline time)", async () => {
    await perform("keyframe.next", ctx({ playheadUs: 2 * SEC }));
    expect(seek).toHaveBeenLastCalledWith(3 * SEC);
    await perform("keyframe.next", ctx({ playheadUs: 3 * SEC }));
    expect(seek).toHaveBeenLastCalledWith(5 * SEC);
    await perform("keyframe.previous", ctx({ playheadUs: 3 * SEC }));
    expect(seek).toHaveBeenLastCalledWith(2 * SEC);
  });

  it("aren't available past the last or before the first keyframe", () => {
    expect(editingActions.get("keyframe.next").when(ctx({ playheadUs: 5 * SEC }))).toBe(false);
    expect(editingActions.get("keyframe.previous").when(ctx({ playheadUs: 2 * SEC }))).toBe(false);
  });
});

describe("keyframe.applyEase", () => {
  beforeEach(() => {
    project = makeProject({ keyframes: { opacity: [key(0, 0), key(2 * SEC, 1)] } });
  });

  it("eases the segment that starts at the keyframe before the playhead", async () => {
    await perform("keyframe.applyEase", ctx({ playheadUs: 3 * SEC }), {
      property: "opacity",
      preset: "easeInOut",
    });
    const [a, b] = clipOf().keyframes.opacity ?? [];
    expect(a).toMatchObject({ interpolation: "bezier", easeOut: { speed: 0 } });
    expect(b).toMatchObject({ easeIn: { speed: 0 } });
  });

  it("bounce adds keyframes, in one undo step", async () => {
    const before = project;
    const applied: unknown[] = [];
    await runAction(
      editingActions,
      "keyframe.applyEase",
      ctx({ playheadUs: 2 * SEC }),
      { property: "opacity", preset: "bounce" },
      (op) => {
        applied.push(op);
        project = applyOp(project, op).project;
      },
    );
    expect(applied).toHaveLength(1);
    expect((clipOf().keyframes.opacity ?? []).length).toBeGreaterThan(2);
    expect(project).not.toEqual(before);
  });

  it("explains itself when the property has no keyframe to ease", async () => {
    await expect(
      perform("keyframe.applyEase", ctx({ playheadUs: 3 * SEC }), {
        property: "rotation",
        preset: "easeIn",
      }),
    ).rejects.toThrow(/rotation keyframe/);
  });
});

describe("panel actions", () => {
  it("switch the bottom dock", async () => {
    await perform("panel.showGraph", ctx());
    expect(setBottomPanel).toHaveBeenLastCalledWith("graph");
    await perform("panel.showTimeline", ctx());
    expect(setBottomPanel).toHaveBeenLastCalledWith("timeline");
  });
});
