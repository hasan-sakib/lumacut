import { createClip, createComposition, createProject, createTrack, type Asset, type Op, type Project } from "@lumacut/schema";
import { beforeEach, describe, expect, it } from "vitest";
import type { LoadedProject, ProjectClient, SaveOutcome } from "../api/projects.ts";
import {
  AUTOSAVE_IDLE_MS,
  AUTOSAVE_MAX_MS,
  COALESCE_WINDOW_MS,
  createProjectStore,
  type ProjectState,
} from "./project.ts";

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

function sampleProject(): Project {
  return createProject({
    id: "p",
    now: "2026-11-06T00:00:00Z",
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
            clips: [createClip({ id: "c1", type: "media", assetId: "v1", startUs: 0, inUs: 0, outUs: 2 * SEC })],
          }),
        ],
      }),
    ],
    mainCompositionId: "main",
  });
}

class FakeClient implements ProjectClient {
  version = 1;
  saves: { version: number; doc: Project }[] = [];
  next: SaveOutcome[] = [];
  gate: Promise<void> | null = null;
  loadsOf = 0;
  server: LoadedProject = { project: sampleProject(), version: 1 };

  load(): Promise<LoadedProject> {
    this.loadsOf += 1;
    return Promise.resolve(structuredClone(this.server));
  }
  async save(_id: string, version: number, doc: Project): Promise<SaveOutcome> {
    if (this.gate !== null) await this.gate;
    this.saves.push({ version, doc });
    return this.next.shift() ?? { kind: "saved", version: version + 1 };
  }
}

/** Lets pending promise chains (the awaited save) run to completion. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** A hand-cranked clock and timer queue. */
class FakeTime {
  now = 0;
  private timers = new Map<number, { at: number; fn: () => void }>();
  private id = 0;
  setTimer = (fn: () => void, ms: number): number => {
    this.id += 1;
    this.timers.set(this.id, { at: this.now + ms, fn });
    return this.id;
  };
  clearTimer = (handle: unknown): void => {
    this.timers.delete(handle as number);
  };
  get pending(): number {
    return this.timers.size;
  }
  async advance(ms: number): Promise<void> {
    const target = this.now + ms;
    for (;;) {
      const due = [...this.timers.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (due === undefined) break;
      this.timers.delete(due[0]);
      this.now = due[1].at;
      due[1].fn();
      await settle();
    }
    this.now = target;
    await settle();
  }
}

let client: FakeClient;
let time: FakeTime;
let store: ReturnType<typeof createProjectStore>;
const state = (): ProjectState => store.getState();
const trim = (toSec: number): Op => ({ type: "trimClip", clipId: "c1", edge: "end", toUs: toSec * SEC });
const clipEnd = (): number | undefined => state().project?.compositions[0]?.tracks[0]?.clips[0]?.outUs;

beforeEach(async () => {
  client = new FakeClient();
  time = new FakeTime();
  store = createProjectStore({ client, now: () => time.now, setTimer: time.setTimer, clearTimer: time.clearTimer });
  await state().open("p");
});

describe("opening", () => {
  it("loads the document and its version", () => {
    expect(state().project?.id).toBe("p");
    expect(state().version).toBe(1);
    expect(state().saveState).toBe("saved");
  });

  it("reports a load failure", async () => {
    client.load = () => Promise.reject(new Error("nope"));
    await state().open("x");
    expect(state().loadError).toBe("nope");
    expect(state().project).toBeNull();
  });

  it("dispatch needs an open project", () => {
    state().close();
    expect(state().dispatch(trim(1))).toMatchObject({ ok: false, code: "no_project" });
  });
});

describe("dispatch and history", () => {
  it("applies ops through applyOp and refuses invalid ones without changing anything", () => {
    expect(state().dispatch(trim(1))).toEqual({ ok: true });
    expect(clipEnd()).toBe(1 * SEC);
    const refused = state().dispatch({ type: "removeClip", clipId: "nope" });
    expect(refused).toMatchObject({ ok: false, code: "unknown_clip" });
    expect(clipEnd()).toBe(1 * SEC);
    expect(state().undoStack).toHaveLength(1);
  });

  it("undo and redo walk the stacks and restore the document exactly", () => {
    const before = structuredClone(state().project);
    state().dispatch(trim(1));
    state().dispatch({ type: "setProps", clipId: "c1", props: { opacity: 0.5 } });
    expect(state().undoStack.map((e) => e.label)).toEqual(["Trim Clip", "Set Props"]);
    state().undo();
    state().undo();
    expect(state().project).toEqual(before);
    expect(state().redoStack).toHaveLength(2);
    state().redo();
    state().redo();
    expect(clipEnd()).toBe(1 * SEC);
    expect(state().project?.compositions[0]?.tracks[0]?.clips[0]?.opacity).toBe(0.5);
    state().undo();
    state().undo();
    expect(state().project).toEqual(before);
  });

  it("a new edit clears the redo stack; empty stacks report instead of throwing", () => {
    expect(state().undo()).toMatchObject({ ok: false });
    expect(state().redo()).toMatchObject({ ok: false });
    state().dispatch(trim(1));
    state().undo();
    expect(state().redoStack).toHaveLength(1);
    state().dispatch(trim(1.5));
    expect(state().redoStack).toHaveLength(0);
  });

  it("uses the label of a batch", () => {
    state().dispatch({ type: "batch", label: "Tidy up", ops: [trim(1)] });
    expect(state().undoStack.at(-1)?.label).toBe("Tidy up");
  });

  it("merges rapid edits with the same key into one undo step, but not slow or different ones", () => {
    const before = structuredClone(state().project);
    const drag = (v: number) => state().dispatch({ type: "setProps", clipId: "c1", props: { opacity: v } }, { coalesceKey: "opacity" });
    drag(0.9);
    time.now += COALESCE_WINDOW_MS - 1;
    drag(0.7);
    time.now += 10;
    drag(0.4);
    expect(state().undoStack).toHaveLength(1);
    state().undo();
    expect(state().project).toEqual(before);
    state().redo();
    expect(state().project?.compositions[0]?.tracks[0]?.clips[0]?.opacity).toBe(0.4);
    time.now += COALESCE_WINDOW_MS + 1;
    drag(0.2);
    expect(state().undoStack).toHaveLength(2);
    state().dispatch({ type: "setProps", clipId: "c1", props: { opacity: 0.1 } }, { coalesceKey: "other" });
    expect(state().undoStack).toHaveLength(3);
  });

  it("caps the history length", () => {
    for (let i = 0; i < 210; i += 1) state().dispatch({ type: "setProps", clipId: "c1", props: { opacity: (i % 10) / 10 } });
    expect(state().undoStack.length).toBeLessThanOrEqual(200);
  });
});

describe("composition duration", () => {
  it("follows the content in the same undo step", () => {
    expect(state().project?.compositions[0]?.durationUs).toBe(10 * SEC); // fixture value, content is 2 s
    state().dispatch(trim(1));
    expect(state().project?.compositions[0]?.durationUs).toBe(1 * SEC);
    expect(state().undoStack).toHaveLength(1);
    state().undo();
    expect(state().project?.compositions[0]?.durationUs).toBe(10 * SEC);
    state().redo();
    expect(state().project?.compositions[0]?.durationUs).toBe(1 * SEC);
  });
});

describe("autosave", () => {
  it("saves after the idle time, with the loaded version, then marks saved", async () => {
    state().dispatch(trim(1));
    expect(state().saveState).toBe("dirty");
    await time.advance(AUTOSAVE_IDLE_MS - 1);
    expect(client.saves).toHaveLength(0);
    await time.advance(1);
    expect(client.saves).toHaveLength(1);
    expect(client.saves[0]?.version).toBe(1);
    expect(state().saveState).toBe("saved");
    expect(state().version).toBe(2);
  });

  it("keeps postponing while edits continue, but never past the maximum wait", async () => {
    for (let i = 0; i < 9; i += 1) {
      state().dispatch({ type: "setProps", clipId: "c1", props: { opacity: (i + 1) / 10 } });
      await time.advance(AUTOSAVE_IDLE_MS - 100);
    }
    expect(client.saves.length).toBeGreaterThanOrEqual(1);
    expect(time.now).toBeLessThanOrEqual(AUTOSAVE_MAX_MS + AUTOSAVE_IDLE_MS);
  });

  it("an edit made during a save is saved next, with the new version", async () => {
    let release!: () => void;
    client.gate = new Promise((r) => (release = r));
    state().dispatch(trim(1));
    await time.advance(AUTOSAVE_IDLE_MS);
    expect(state().saveState).toBe("saving");
    state().dispatch(trim(1.5));
    client.gate = null;
    release();
    await time.advance(0);
    await time.advance(AUTOSAVE_IDLE_MS);
    expect(client.saves.map((s) => s.version)).toEqual([1, 2]);
    expect(state().saveState).toBe("saved");
  });

  it("saveNow flushes immediately and does nothing when there is nothing to save", async () => {
    await state().saveNow();
    expect(client.saves).toHaveLength(0);
    state().dispatch(trim(1));
    await state().saveNow();
    expect(client.saves).toHaveLength(1);
    expect(time.pending).toBe(0);
  });

  it("goes offline on a retryable failure and retries with backoff until it works", async () => {
    client.next = [
      { kind: "failed", message: "offline", retryable: true },
      { kind: "failed", message: "offline", retryable: true },
    ];
    state().dispatch(trim(1));
    await time.advance(AUTOSAVE_IDLE_MS);
    expect(state().saveState).toBe("offline");
    await time.advance(1000);
    expect(client.saves).toHaveLength(2);
    expect(state().saveState).toBe("offline");
    await time.advance(2000);
    expect(client.saves).toHaveLength(3);
    expect(state().saveState).toBe("saved");
    expect(state().version).toBe(2);
  });

  it("a non-retryable failure stops and shows the message", async () => {
    client.next = [{ kind: "failed", message: "The project isn't valid", retryable: false }];
    state().dispatch(trim(1));
    await time.advance(AUTOSAVE_IDLE_MS);
    expect(state().saveState).toBe("error");
    expect(state().saveError).toBe("The project isn't valid");
    await time.advance(60_000);
    expect(client.saves).toHaveLength(1);
  });
});

describe("conflicts", () => {
  beforeEach(async () => {
    client.next = [{ kind: "conflict", currentVersion: 5 }];
    state().dispatch(trim(1));
    await time.advance(AUTOSAVE_IDLE_MS);
  });

  it("stops saving and remembers the server's version", async () => {
    expect(state().saveState).toBe("conflict");
    expect(state().serverVersion).toBe(5);
    state().dispatch(trim(1.5)); // further edits stay local
    await time.advance(60_000);
    expect(client.saves).toHaveLength(1);
    expect(state().saveState).toBe("conflict");
  });

  it("keep mine: saves over the server's version", async () => {
    await state().resolveConflict("overwrite");
    expect(client.saves.at(-1)?.version).toBe(5);
    expect(state().saveState).toBe("saved");
    expect(state().version).toBe(6);
  });

  it("reload: replaces the document with the server's and clears history", async () => {
    client.server = { project: sampleProject(), version: 5 };
    await state().resolveConflict("reload");
    expect(state().version).toBe(5);
    expect(clipEnd()).toBe(2 * SEC);
    expect(state().undoStack).toHaveLength(0);
    expect(state().saveState).toBe("saved");
  });
});

describe("switching projects", () => {
  it("a late save result from the previous project is ignored", async () => {
    let release!: () => void;
    client.gate = new Promise((r) => (release = r));
    state().dispatch(trim(1));
    await time.advance(AUTOSAVE_IDLE_MS);
    await state().open("other");
    client.gate = null;
    release();
    await time.advance(0);
    expect(state().projectId).toBe("other");
    expect(state().saveState).toBe("saved");
    expect(state().version).toBe(1);
  });
});
