import { runAction } from "@lumacut/actions";
import { applyOp } from "@lumacut/ops";
import { createClip, createComposition, createProject, createTrack, type Asset, type Clip, type Project } from "@lumacut/schema";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_IMAGE_US, editingActions, type EditingContext } from "./editing.ts";

const SEC = 1_000_000;

const videoAsset: Asset = {
  id: "v1",
  kind: "video",
  name: "clip.mp4",
  mimeType: "video/mp4",
  sizeBytes: 1,
  source: "user",
  video: { width: 1280, height: 720, fps: { num: 30, den: 1 }, durationUs: 4 * SEC, codec: "avc1" },
  audio: { sampleRate: 48_000, channels: 2, durationUs: 4 * SEC, codec: "aac" },
};
const audioAsset: Asset = {
  id: "a1",
  kind: "audio",
  name: "song.wav",
  mimeType: "audio/wav",
  sizeBytes: 1,
  source: "user",
  audio: { sampleRate: 48_000, channels: 2, durationUs: 6 * SEC, codec: "pcm" },
};
const imageAsset: Asset = { id: "i1", kind: "image", name: "p.png", mimeType: "image/png", sizeBytes: 1, source: "user", image: { width: 800, height: 600 } };

const media = (id: string, start: number, seconds: number, extra: Partial<Clip> = {}): Clip =>
  createClip({ id, type: "media", assetId: "v1", startUs: start * SEC, inUs: 0, outUs: seconds * SEC, ...extra });

function projectWith(): Project {
  return createProject({
    id: "p",
    now: "2026-11-06T00:00:00Z",
    assets: [videoAsset],
    compositions: [
      createComposition({
        id: "main",
        width: 1920,
        height: 1080,
        durationUs: 10 * SEC,
        tracks: [
          createTrack({ id: "V1", kind: "visual", clips: [media("c1", 0, 2, { linkId: "L" }), media("c2", 2, 2)] }),
          createTrack({ id: "A1", kind: "audio", clips: [media("a1c", 0, 2, { linkId: "L" })] }),
        ],
      }),
    ],
    mainCompositionId: "main",
  });
}

let counter = 0;
let project: Project;
const undo = vi.fn();
const redo = vi.fn();
const openPalette = vi.fn();
const showShortcuts = vi.fn();

function ctx(partial: Partial<EditingContext> = {}): EditingContext {
  return {
    project,
    compositionId: "main",
    selectedClipIds: [],
    selectedTrackId: null,
    playheadUs: 0,
    canUndo: false,
    canRedo: false,
    services: {
      newId: () => `n${String(++counter)}`,
      undo,
      redo,
      assetForProject: (id) => [videoAsset, audioAsset, imageAsset].find((a) => a.id === id) ?? null,
      openPalette,
      showShortcuts,
    },
    ...partial,
  };
}

/** Runs an action and applies its ops with the real applyOp, like the app does. */
async function perform(id: string, context: EditingContext, args?: unknown): Promise<void> {
  await runAction(editingActions, id, context, args, (op) => {
    project = applyOp(project, op).project;
  });
}

const clipsOn = (trackId: string): string[] => project.compositions[0]?.tracks.find((t) => t.id === trackId)?.clips.map((c) => c.id) ?? [];
const clipById = (id: string): Clip | undefined => project.compositions[0]?.tracks.flatMap((t) => t.clips).find((c) => c.id === id);

beforeEach(() => {
  counter = 0;
  project = projectWith();
  undo.mockClear();
  redo.mockClear();
});

describe("registry", () => {
  it("every action has a title, description and keywords, and shortcuts don't clash", () => {
    const all = editingActions.list();
    expect(all.length).toBeGreaterThanOrEqual(18);
    for (const a of all) {
      expect(a.title.length).toBeGreaterThan(2);
      expect(a.description.length).toBeGreaterThan(15);
      expect(a.keywords.length).toBeGreaterThan(0);
    }
    expect(editingActions.get("clip.split").shortcut).toBe("S");
  });

  it("exposes a tool list for the AI with args for the actions that take them", () => {
    const tools = editingActions.toToolList();
    expect(tools.find((t) => t.id === "timeline.addAssetAtPlayhead")?.args).toMatchObject({ properties: { assetId: { type: "string" } } });
    expect(tools.find((t) => t.id === "clip.split")?.args).toBeNull();
  });

  it("is searchable by synonym", () => {
    const c = ctx({ playheadUs: 1 * SEC });
    expect(editingActions.search("razor", c)[0]?.action.id).toBe("clip.split");
    expect(editingActions.search("silence", ctx({ selectedTrackId: "A1" }))[0]?.action.id).toBe("track.toggleMute");
  });
});

describe("history", () => {
  it("undo and redo call the services and are only available when there is something to do", async () => {
    expect(editingActions.available(ctx()).map((a) => a.id)).not.toContain("history.undo");
    const c = ctx({ canUndo: true, canRedo: true });
    await perform("history.undo", c);
    await perform("history.redo", c);
    expect(undo).toHaveBeenCalledOnce();
    expect(redo).toHaveBeenCalledOnce();
    expect(editingActions.get("history.undo").shortcut).toBe("Mod+Z");
  });
});

describe("clip.split", () => {
  it("with no selection cuts every clip under the playhead, relinking the new halves", async () => {
    await perform("clip.split", ctx({ playheadUs: 1 * SEC }));
    expect(clipsOn("V1")).toEqual(["c1", "n1", "c2"]);
    expect(clipsOn("A1")).toEqual(["a1c", "n2"]);
    expect(clipById("n1")?.startUs).toBe(1 * SEC);
    // the first halves are still linked together, and so are the second halves (to a new group)
    expect(clipById("c1")?.linkId).toBe("L");
    expect(clipById("n1")?.linkId).toBeDefined();
    expect(clipById("n1")?.linkId).toBe(clipById("n2")?.linkId);
    expect(clipById("n1")?.linkId).not.toBe("L");
  });

  it("with a selection cuts only that clip and its linked partner", async () => {
    await perform("clip.split", ctx({ playheadUs: 3 * SEC, selectedClipIds: ["c2"] }));
    expect(clipsOn("V1")).toEqual(["c1", "c2", "n1"]);
    await perform("clip.split", ctx({ playheadUs: 1 * SEC, selectedClipIds: ["c1"] }));
    expect(clipsOn("A1")).toHaveLength(2); // the linked audio was cut too
  });

  it("is unavailable when the playhead is on an edge or a gap, or the track is locked", () => {
    expect(editingActions.available(ctx({ playheadUs: 2 * SEC })).map((a) => a.id)).not.toContain("clip.split");
    expect(editingActions.available(ctx({ playheadUs: 9 * SEC })).map((a) => a.id)).not.toContain("clip.split");
    project = applyOp(project, { type: "setTrackProps", trackId: "V1", props: { locked: true } }).project;
    project = applyOp(project, { type: "setTrackProps", trackId: "A1", props: { locked: true } }).project;
    expect(editingActions.available(ctx({ playheadUs: 1 * SEC })).map((a) => a.id)).not.toContain("clip.split");
  });
});

describe("clip.delete / rippleDelete / duplicate", () => {
  it("delete removes the selection and its linked partners", async () => {
    await perform("clip.delete", ctx({ selectedClipIds: ["c1"] }));
    expect(clipsOn("V1")).toEqual(["c2"]);
    expect(clipsOn("A1")).toEqual([]);
  });

  it("ripple delete closes the gap", async () => {
    await perform("clip.rippleDelete", ctx({ selectedClipIds: ["c1"] }));
    expect(clipById("c2")?.startUs).toBe(0);
    expect(clipsOn("V1")).toEqual(["c2"]);
  });

  it("both need a selection", () => {
    const ids = editingActions.available(ctx()).map((a) => a.id);
    expect(ids).not.toContain("clip.delete");
    expect(ids).not.toContain("clip.rippleDelete");
    expect(ids).not.toContain("clip.duplicate");
  });

  it("duplicate places an unlinked copy right after the selection", async () => {
    await perform("clip.duplicate", ctx({ selectedClipIds: ["c2"] }));
    expect(clipsOn("V1")).toEqual(["c1", "c2", "n1"]);
    const copy = clipById("n1");
    expect(copy?.startUs).toBe(4 * SEC);
    expect(copy?.assetId).toBe("v1");
    expect(copy?.linkId).toBeUndefined();
  });

  it("duplicate is refused (with a reason) when the copy wouldn't fit", async () => {
    await expect(perform("clip.duplicate", ctx({ selectedClipIds: ["c1"] }))).rejects.toThrow(/overlaps/);
    expect(clipsOn("V1")).toEqual(["c1", "c2"]);
  });
});

describe("links", () => {
  it("link needs two clips; unlink dissolves the group", async () => {
    expect(editingActions.available(ctx({ selectedClipIds: ["c2"] })).map((a) => a.id)).not.toContain("clip.link");
    await perform("clip.link", ctx({ selectedClipIds: ["c2", "c1"] }));
    expect(clipById("c2")?.linkId).toBe("n1");
    expect(clipById("c1")?.linkId).toBe("n1");
    await perform("clip.unlink", ctx({ selectedClipIds: ["c1"] }));
    expect(clipById("c1")?.linkId).toBeUndefined();
    expect(clipById("c2")?.linkId).toBeUndefined();
    expect(editingActions.available(ctx({ selectedClipIds: ["c1"] })).map((a) => a.id)).not.toContain("clip.unlink");
  });
});

describe("tracks", () => {
  it("adds video and audio tracks on top with counted names", async () => {
    await perform("track.addVideo", ctx());
    await perform("track.addAudio", ctx());
    const tracks = project.compositions[0]?.tracks ?? [];
    expect(tracks.map((t) => t.name)).toEqual(["V1", "A1", "Video 2", "Audio 2"]);
    expect(tracks.at(-1)?.kind).toBe("audio");
    expect(tracks.filter((t) => t.kind === "visual")).toHaveLength(2);
  });

  it("toggles and removal act on the selected track only", async () => {
    const none = editingActions.available(ctx()).map((a) => a.id);
    expect(none).not.toContain("track.toggleMute");
    expect(none).not.toContain("track.remove");
    const c = () => ctx({ selectedTrackId: "A1" });
    await perform("track.toggleMute", c());
    await perform("track.toggleSolo", c());
    await perform("track.toggleLock", c());
    await perform("track.toggleHide", c());
    const a1 = project.compositions[0]?.tracks.find((t) => t.id === "A1");
    expect(a1).toMatchObject({ muted: true, solo: true, locked: true, hidden: true });
    await perform("track.toggleMute", c());
    expect(project.compositions[0]?.tracks.find((t) => t.id === "A1")?.muted).toBe(false);
    await perform("track.toggleLock", c());
    await perform("track.remove", c());
    expect(project.compositions[0]?.tracks.map((t) => t.id)).toEqual(["V1"]);
  });
});

describe("markers", () => {
  it("adds a labelled marker at the playhead and removes it again", async () => {
    await perform("marker.add", ctx({ playheadUs: 3 * SEC }), { label: "Intro" });
    expect(project.compositions[0]?.markers).toMatchObject([{ tUs: 3 * SEC, label: "Intro" }]);
    await perform("marker.add", ctx({ playheadUs: 4 * SEC })); // args are optional
    expect(project.compositions[0]?.markers).toHaveLength(2);
    expect(editingActions.available(ctx({ playheadUs: 5 * SEC })).map((a) => a.id)).not.toContain("marker.remove");
    await perform("marker.remove", ctx({ playheadUs: 3 * SEC }));
    expect(project.compositions[0]?.markers.map((m) => m.tUs)).toEqual([4 * SEC]);
  });
});

describe("timeline.addAssetAtPlayhead", () => {
  it("places a video and its sound, linked, centred, after adding the asset", async () => {
    project = createProject({
      id: "p",
      now: "2026-11-06T00:00:00Z",
      compositions: [
        createComposition({
          id: "main",
          width: 1920,
          height: 1080,
          tracks: [createTrack({ id: "V1", kind: "visual" }), createTrack({ id: "A1", kind: "audio" })],
        }),
      ],
      mainCompositionId: "main",
    });
    await perform("timeline.addAssetAtPlayhead", ctx({ playheadUs: 1 * SEC }), { assetId: "v1" });
    expect(project.assets.map((a) => a.id)).toEqual(["v1"]);
    const video = clipById("n1");
    const sound = clipById("n2");
    expect(video).toMatchObject({ startUs: SEC, inUs: 0, outUs: 4 * SEC });
    expect(video?.transform).toMatchObject({ x: 960, y: 540, anchorX: 640, anchorY: 360 });
    expect(sound?.startUs).toBe(SEC);
    expect(video?.linkId).toBeDefined();
    expect(video?.linkId).toBe(sound?.linkId);
    expect(clipsOn("V1")).toEqual(["n1"]);
    expect(clipsOn("A1")).toEqual(["n2"]);
  });

  it("uses a free spot on an existing track, or makes a new track when the track is busy", async () => {
    await perform("timeline.addAssetAtPlayhead", ctx({ playheadUs: 0 }), { assetId: "v1" });
    const tracks = project.compositions[0]?.tracks ?? [];
    expect(tracks.filter((t) => t.kind === "visual")).toHaveLength(2); // V1 is busy at 0
    expect(tracks.filter((t) => t.kind === "audio")).toHaveLength(2);
    await perform("timeline.addAssetAtPlayhead", ctx({ playheadUs: 5 * SEC }), { assetId: "v1" });
    expect(project.compositions[0]?.tracks.filter((t) => t.kind === "visual")).toHaveLength(2); // reused
  });

  it("audio goes on an audio track alone; an image gets the default length and no sound", async () => {
    await perform("timeline.addAssetAtPlayhead", ctx({ playheadUs: 6 * SEC }), { assetId: "a1" });
    expect(clipById("n1")).toMatchObject({ assetId: "a1", outUs: 6 * SEC });
    expect(clipById("n1")?.linkId).toBeUndefined();
    await perform("timeline.addAssetAtPlayhead", ctx({ playheadUs: 6 * SEC }), { assetId: "i1" });
    const still = project.compositions[0]?.tracks.flatMap((t) => t.clips).find((c) => c.assetId === "i1");
    expect(still?.outUs).toBe(DEFAULT_IMAGE_US);
    expect(project.assets.map((a) => a.id)).toEqual(expect.arrayContaining(["v1", "a1", "i1"]));
  });

  it("explains when the asset isn't ready", async () => {
    await expect(perform("timeline.addAssetAtPlayhead", ctx(), { assetId: "nope" })).rejects.toThrow(/isn't ready/);
    await expect(perform("timeline.addAssetAtPlayhead", ctx(), {})).rejects.toThrow();
  });
});

describe("palette and help", () => {
  it("open the palette and the shortcut list", async () => {
    await perform("palette.open", ctx());
    await perform("help.shortcuts", ctx());
    expect(openPalette).toHaveBeenCalledOnce();
    expect(showShortcuts).toHaveBeenCalledOnce();
    expect(editingActions.get("palette.open").shortcut).toBe("Mod+K");
  });
});

describe("no project", () => {
  it("offers only the actions that need no project", () => {
    const ids = editingActions.available(ctx({ project: null, compositionId: null })).map((a) => a.id);
    expect(ids.sort()).toEqual(["help.shortcuts", "palette.open"]);
  });
});
