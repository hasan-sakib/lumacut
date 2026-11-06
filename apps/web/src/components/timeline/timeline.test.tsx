import { createClip, createComposition, createProject, createTrack, type Asset, type Clip, type Project } from "@lumacut/schema";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Tooltip } from "radix-ui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EditingContext } from "../../actions/editing.ts";
import { useAssetsStore } from "../../stores/assets.ts";
import { Timeline, type TimelineProps } from "./Timeline.tsx";

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
const media = (id: string, start: number, len: number, extra: Partial<Clip> = {}): Clip =>
  createClip({ id, type: "media", assetId: "v1", startUs: start * SEC, inUs: extra.inUs ?? 0, outUs: (extra.inUs ?? 0) + len * SEC, ...extra });

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
        markers: [{ id: "m1", tUs: 5 * SEC, durationUs: 0, label: "Beat", color: { r: 1, g: 0.5, b: 0, a: 1 } }],
        tracks: [
          createTrack({ id: "V1", kind: "visual", clips: [media("c1", 0, 2, { linkId: "L" }), media("c2", 2, 2, { inUs: 2 * SEC }), media("c3", 6, 2, { inUs: 4 * SEC })] }),
          createTrack({ id: "V2", kind: "visual" }),
          createTrack({ id: "A1", kind: "audio", clips: [media("a1", 0, 2, { linkId: "L" })] }),
        ],
      }),
    ],
    mainCompositionId: "main",
  });
}

/** jsdom has no layout: give clips, lanes and the ruler the boxes the timeline's maths expects (100 px per second). */
function installRects() {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const el = this as HTMLElement;
    const box = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
    if (el.dataset.clip !== undefined) return box(parseFloat(el.style.left) || 0, 0, parseFloat(el.style.width) || 0, 48);
    if (el.dataset.lane !== undefined) {
      const index = Array.from(document.querySelectorAll("[data-lane]")).indexOf(el);
      return box(0, index * 56, 2000, 56);
    }
    return box(0, 0, 0, 0);
  });
}

function ctxFor(project: Project): EditingContext {
  return {
    project,
    compositionId: "main",
    selectedClipIds: [],
    selectedTrackId: null,
    playheadUs: 0,
    canUndo: false,
    canRedo: false,
    hasClipboard: false,
    hasAttributes: false,
    clipboard: null,
    attributes: null,
    services: {
      newId: () => "new",
      undo: vi.fn(),
      redo: vi.fn(),
      resolveAsset: () => ({ error: "none" }),
      clipboard: { setClips: vi.fn(), setAttributes: vi.fn() },
      openPalette: vi.fn(),
      showShortcuts: vi.fn(),
      playback: { togglePlay: vi.fn(), seek: vi.fn() },
      editor: { setTool: vi.fn(), zoomBy: vi.fn(), zoomFit: vi.fn(), toggleSnapping: vi.fn(), selectClips: vi.fn() },
    },
  };
}

let counter = 0;
function setup(over: Partial<TimelineProps> = {}) {
  const project = over.project ?? sampleProject();
  const props: TimelineProps = {
    project,
    composition: project.compositions[0] as NonNullable<(typeof project.compositions)[0]>,
    ctx: ctxFor(project),
    tool: "select",
    zoomPxPerSec: 100,
    scrollUs: 0,
    snapping: false,
    playheadUs: 0,
    playing: false,
    selectedClipIds: [],
    selectedTrackId: null,
    newId: () => `n${String(++counter)}`,
    onSelectClips: vi.fn(),
    onSelectTrack: vi.fn(),
    onSeek: vi.fn(),
    onCommit: vi.fn(),
    onRunAction: vi.fn(),
    onZoom: vi.fn(),
    onScroll: vi.fn(),
    onViewport: vi.fn(),
    ...over,
  };
  const view = render(
    <Tooltip.Provider>
      <Timeline {...props} />
    </Tooltip.Provider>,
  );
  const clip = (id: string) => view.container.querySelector(`[data-clip="${id}"]`) as HTMLElement;
  return { props, clip, ...view };
}

const down = (el: Element, x: number, extra: Record<string, unknown> = {}) => fireEvent.pointerDown(el, { clientX: x, clientY: 20, button: 0, pointerId: 1, ...extra });
const move = (x: number, y = 20) => fireEvent.pointerMove(window, { clientX: x, clientY: y, pointerId: 1 });
const up = () => fireEvent.pointerUp(window, { pointerId: 1 });

beforeEach(() => {
  counter = 0;
  installRects();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("drawing", () => {
  it("puts each clip where its time is, at the zoom", () => {
    const { clip } = setup();
    expect(clip("c1").style.left).toBe("0px");
    expect(clip("c1").style.width).toBe("200px");
    expect(clip("c2").style.left).toBe("200px");
    expect(clip("c3").style.left).toBe("600px");
    setup({ zoomPxPerSec: 50 });
    expect(document.querySelectorAll('[data-clip="c3"]')[1]?.getAttribute("style")).toContain("left: 300px");
  });

  it("lists tracks top-down with the last track on top, with headers", () => {
    setup();
    const names = screen.getAllByTestId("track-header").map((h) => h.getAttribute("data-track"));
    expect(names).toEqual(["A1", "V2", "V1"]);
  });

  it("shows the playhead and the marker", () => {
    setup({ playheadUs: 3 * SEC });
    expect(screen.getByTestId("playhead").style.left).toBe("468px"); // 168 header + 300
    expect(screen.getByLabelText(/Marker Beat/)).toBeTruthy();
  });

  it("says so when there are no tracks", () => {
    const empty = createProject({ id: "e", now: "2026-11-06T00:00:00Z", compositions: [createComposition({ id: "main", width: 10, height: 10 })], mainCompositionId: "main" });
    setup({ project: empty });
    expect(screen.getByText(/no tracks/i)).toBeTruthy();
  });
});

describe("selection", () => {
  it("clicking a clip selects it and the clips linked to it", () => {
    const { props, clip } = setup();
    down(clip("c1"), 100);
    expect(props.onSelectClips).toHaveBeenCalledWith(expect.arrayContaining(["c1", "a1"]));
    expect(props.onSelectClips).toHaveBeenCalledTimes(1);
  });

  it("Alt-click selects only that clip; Shift-click toggles", () => {
    const { props, clip } = setup();
    down(clip("c1"), 100, { altKey: true });
    expect(props.onSelectClips).toHaveBeenLastCalledWith(["c1"]);
    cleanup();
    const second = setup({ selectedClipIds: ["c2"] });
    down(second.clip("c3"), 700, { shiftKey: true });
    expect(second.props.onSelectClips).toHaveBeenLastCalledWith(["c2", "c3"]);
    cleanup();
    const third = setup({ selectedClipIds: ["c2", "c3"] });
    down(third.clip("c3"), 700, { shiftKey: true });
    expect(third.props.onSelectClips).toHaveBeenLastCalledWith(["c2"]);
  });

  it("clicking empty lane clears the selection and selects the track", () => {
    const { props } = setup({ selectedClipIds: ["c2"] });
    const lane = document.querySelector('[data-lane="V2"]') as HTMLElement;
    down(lane, 300);
    expect(props.onSelectClips).toHaveBeenCalledWith([]);
    expect(props.onSelectTrack).toHaveBeenCalledWith("V2");
  });

  it("clicking a track header selects the track, clicking again deselects it", () => {
    const first = setup();
    fireEvent.click(screen.getAllByRole("button", { name: /^V1$/ })[0] as HTMLElement);
    expect(first.props.onSelectTrack).toHaveBeenCalledWith("V1");
    cleanup();
    const second = setup({ selectedTrackId: "V1" });
    fireEvent.click(screen.getAllByRole("button", { name: /^V1$/ })[0] as HTMLElement);
    expect(second.props.onSelectTrack).toHaveBeenCalledWith(null);
  });
});

describe("moving clips by dragging", () => {
  it("commits one op on release, moving a clip and everything linked to it", () => {
    const { props, clip } = setup();
    down(clip("c1"), 100);
    move(100 + 800); // 8 s to the right
    up();
    expect(props.onCommit).toHaveBeenCalledTimes(1);
    const [op, label] = (props.onCommit as ReturnType<typeof vi.fn>).mock.calls[0] as [{ type: string; ops?: { clipId: string; startUs: number }[] }, string];
    expect(label).toBe("Move clips");
    expect(op.type).toBe("batch");
    expect(op.ops?.map((o) => [o.clipId, o.startUs]).sort()).toEqual([["a1", 8 * SEC], ["c1", 8 * SEC]]);
  });

  it("shows the result while dragging, and changes nothing until release", () => {
    const { props, clip } = setup();
    down(clip("c3"), 700);
    move(700 - 100);
    expect(clip("c3").style.left).toBe("500px"); // drawn where it would land
    expect(props.onCommit).not.toHaveBeenCalled();
    up();
    expect(props.onCommit).toHaveBeenCalledTimes(1);
  });

  it("a click that doesn't travel is not a drag", () => {
    const { props, clip } = setup();
    down(clip("c2"), 300);
    move(301);
    up();
    expect(props.onCommit).not.toHaveBeenCalled();
  });

  it("a drag the project would refuse turns red, explains why, and commits nothing", () => {
    const { props, clip } = setup();
    down(clip("c2"), 300);
    move(300 - 100); // onto c1
    expect(screen.getByTestId("drag-error").textContent).toMatch(/overlaps/);
    expect(clip("c2").getAttribute("data-invalid")).toBe("true");
    up();
    expect(props.onCommit).not.toHaveBeenCalled();
    expect(screen.queryByTestId("drag-error")).toBeNull();
  });

  it("Escape cancels the drag", () => {
    const { props, clip } = setup();
    down(clip("c3"), 700);
    move(500);
    fireEvent.keyDown(window, { key: "Escape" });
    up();
    expect(props.onCommit).not.toHaveBeenCalled();
    expect(clip("c3").style.left).toBe("600px");
  });

  it("snaps to a neighbouring edge and draws the snap line", () => {
    const { props, clip } = setup({ snapping: true });
    down(clip("c3"), 700);
    move(700 - 195); // start lands 5 px from c2's end (4 s)
    expect(screen.getByTestId("snap-line")).toBeTruthy();
    up();
    const [op] = (props.onCommit as ReturnType<typeof vi.fn>).mock.calls[0] as [{ type: string; startUs: number }];
    expect(op).toMatchObject({ type: "moveClip", startUs: 4 * SEC });
  });
});

describe("trimming", () => {
  it("dragging the end edge with the selection tool trims the clip", () => {
    const { props, clip } = setup();
    down(clip("c3"), 797); // inside the 7 px end handle of c3 [600, 800)
    move(797 + 100);
    up();
    expect(props.onCommit).toHaveBeenCalledWith({ type: "trimClip", clipId: "c3", edge: "end", toUs: 9 * SEC }, "Trim clip");
  });

  it("the ripple tool uses rippleTrim", () => {
    const { props, clip } = setup({ tool: "ripple" });
    down(clip("c3"), 797);
    move(797 - 100);
    up();
    expect(props.onCommit).toHaveBeenCalledWith({ type: "rippleTrim", clipId: "c3", edge: "end", toUs: 7 * SEC }, "Trim clip");
  });

  it("the ripple tool ignores a drag on the body of a clip", () => {
    const { props, clip } = setup({ tool: "ripple" });
    down(clip("c3"), 700);
    move(500);
    up();
    expect(props.onCommit).not.toHaveBeenCalled();
  });
});

describe("other tools", () => {
  it("roll moves the cut between adjacent clips", () => {
    const { props, clip } = setup({ tool: "roll" });
    down(clip("c1"), 197); // end handle of c1, which touches c2
    move(197 - 50);
    up();
    expect(props.onCommit).toHaveBeenCalledWith({ type: "rollEdit", leftClipId: "c1", rightClipId: "c2", toUs: 1_500_000 }, "Roll edit");
  });

  it("roll does nothing at an edge with no neighbour", () => {
    const { props, clip } = setup({ tool: "roll" });
    down(clip("c3"), 797);
    move(900);
    up();
    expect(props.onCommit).not.toHaveBeenCalled();
  });

  it("slip shifts the media under the clip against the drag", () => {
    const { props, clip } = setup({ tool: "slip" });
    down(clip("c2"), 300);
    move(300 + 50);
    up();
    expect(props.onCommit).toHaveBeenCalledWith({ type: "slipClip", clipId: "c2", deltaUs: -500_000 }, "Slip clip");
  });

  it("slide moves the clip along the track", () => {
    const { props, clip } = setup({ tool: "slide" });
    down(clip("c2"), 300);
    move(300 + 50);
    up();
    expect(props.onCommit).toHaveBeenCalledWith({ type: "slideClip", clipId: "c2", deltaUs: 500_000 }, "Slide clip");
  });

  it("the razor cuts where you click, clips linked to it too, in one op", () => {
    const { props, clip } = setup({ tool: "razor" });
    down(clip("c1"), 100); // 1 s
    expect(props.onCommit).toHaveBeenCalledTimes(1);
    const [op, label] = (props.onCommit as ReturnType<typeof vi.fn>).mock.calls[0] as [{ type: string; ops: { type: string; atUs?: number }[] }, string];
    expect(label).toBe("Split clips");
    expect(op.ops.filter((o) => o.type === "splitClip").map((o) => o.atUs)).toEqual([SEC, SEC]);
    expect(props.onSelectClips).not.toHaveBeenCalled();
  });

  it("the razor does nothing on a clip edge", () => {
    const { props, clip } = setup({ tool: "razor" });
    down(clip("c2"), 200);
    expect(props.onCommit).not.toHaveBeenCalled();
  });
});

describe("track headers, ruler and markers", () => {
  it("a header switch runs the same action as the palette, aimed at its own track", () => {
    const { props } = setup();
    const header = document.querySelector('[data-track="V1"]') as HTMLElement;
    fireEvent.click(header.querySelector('button[aria-label="Mute / unmute track"]') as HTMLElement);
    const [action, args] = (props.onRunAction as ReturnType<typeof vi.fn>).mock.calls[0] as [{ id: string }, unknown];
    expect(action.id).toBe("track.toggleMute");
    expect(args).toEqual({ trackId: "V1" });
  });

  it("shows which switches are on", () => {
    const base = sampleProject();
    const muted = { ...base, compositions: [{ ...(base.compositions[0] as NonNullable<(typeof base.compositions)[0]>), tracks: (base.compositions[0]?.tracks ?? []).map((t) => (t.id === "A1" ? { ...t, muted: true } : t)) }] };
    setup({ project: muted });
    const header = document.querySelector('[data-track="A1"]') as HTMLElement;
    expect(header.querySelector('button[aria-label="Mute / unmute track"]')?.getAttribute("aria-pressed")).toBe("true");
    expect(header.querySelector('button[aria-label="Lock / unlock track"]')?.getAttribute("aria-pressed")).toBe("false");
  });

  it("pressing on the ruler moves the playhead to that frame, and dragging scrubs", () => {
    const { props } = setup();
    const ruler = screen.getByTestId("ruler");
    down(ruler, 250);
    expect(props.onSeek).toHaveBeenLastCalledWith(2_500_000);
    move(300);
    expect(props.onSeek).toHaveBeenLastCalledWith(3 * SEC);
    up();
    move(400);
    expect(props.onSeek).toHaveBeenCalledTimes(2); // stopped following after release
  });

  it("dragging a marker commits one updateMarker", () => {
    const { props } = setup();
    const marker = document.querySelector('[data-marker="m1"]') as HTMLElement;
    down(marker, 500);
    move(600);
    up();
    expect(props.onCommit).toHaveBeenCalledWith(expect.objectContaining({ type: "updateMarker", compositionId: "main", marker: expect.objectContaining({ id: "m1", tUs: 6 * SEC }) }), "Move marker");
  });
});

describe("right-click and media on clips", () => {
  it("right-clicking an unselected clip selects it (and its linked partners) first; a selected one is left alone", () => {
    const { props, clip } = setup();
    fireEvent.contextMenu(clip("c1"));
    expect(props.onSelectClips).toHaveBeenCalledWith(expect.arrayContaining(["c1", "a1"]));
    cleanup();
    const again = setup({ selectedClipIds: ["c2"] });
    fireEvent.contextMenu(again.clip("c2"));
    expect(again.props.onSelectClips).not.toHaveBeenCalled();
  });

  it("draws a filmstrip on picture clips and a waveform on sound clips from the library renditions", async () => {
    const index = { intervalUs: SEC, tileWidth: 80, tileHeight: 45, columns: 4, rows: 2, count: 10 };
    const wave = { channels: 1, length: 1000, data: Array.from({ length: 2000 }, (_, i) => (i % 2 === 0 ? -50 : 50)) };
    vi.stubGlobal("fetch", (url: string) => Promise.resolve({ ok: true, json: () => Promise.resolve(url.includes("index") ? index : wave) }));
    useAssetsStore.setState({
      order: ["v1"],
      byId: {
        v1: {
          id: "v1", kind: "video", name: "clip.mp4", mimeType: "video/mp4", sizeBytes: 1, status: "ready", stage: null, progress: 1,
          errorCode: null, errorMessage: null, attempts: 1, createdAt: "2026-11-06T00:00:00Z", updatedAt: "2026-11-06T00:00:00Z", readyAt: "2026-11-06T00:00:00Z", media: null,
          urls: { thumbSheets: ["https://s3/m3b2/sheet0.jpg"], thumbIndex: "https://s3/m3b2/thumbs/index.json?sig=1", waveform: "https://s3/m3b2/wave.json?sig=1" },
        },
      },
    });
    setup();
    expect((await screen.findAllByTestId("filmstrip")).length).toBeGreaterThan(0);
    expect((await screen.findAllByTestId("clip-waveform")).length).toBeGreaterThan(0);
    const tile = document.querySelector('[data-testid="filmstrip"] img') as HTMLImageElement;
    expect(tile.getAttribute("crossorigin")).toBe("anonymous");
    expect(tile.src).toContain("sheet0.jpg");
    // the sound clip is on the audio lane, the pictures on the visual lanes
    expect(document.querySelector('[data-lane="A1"] [data-testid="clip-waveform"]')).not.toBeNull();
    expect(document.querySelector('[data-lane="V1"] [data-testid="filmstrip"]')).not.toBeNull();
    expect(document.querySelector('[data-lane="V1"] [data-testid="clip-waveform"]')).toBeNull();
    vi.unstubAllGlobals();
    useAssetsStore.setState({ order: [], byId: {} });
  });

  it("clips without library renditions are plain boxes", () => {
    setup();
    expect(screen.queryByTestId("filmstrip")).toBeNull();
    expect(screen.queryByTestId("clip-waveform")).toBeNull();
  });
});
