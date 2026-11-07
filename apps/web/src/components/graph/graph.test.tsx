import { createClip, type Clip, type Keyframe, type Op } from "@lumacut/schema";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { must } from "../../lib/must.ts";
import { GRAPH_HEIGHT, GRAPH_WIDTH, GraphEditor } from "./GraphEditor.tsx";

const SEC = 1_000_000;
const key = (tUs: number, value: Keyframe["value"], extra: Partial<Keyframe> = {}): Keyframe => ({
  tUs,
  value,
  interpolation: "bezier",
  ...extra,
});

/** A 2 s clip starting at 1 s with an animated opacity. */
const clip = (frames: Keyframe[] = [key(0, 0), key(SEC, 1), key(2 * SEC, 0.5)]): Clip =>
  createClip({
    id: "c",
    type: "solid",
    startUs: SEC,
    inUs: 0,
    outUs: 2 * SEC,
    keyframes: { opacity: frames },
  });

beforeEach(() => {
  // The svg's box is exactly the drawing area, so pointer pixels are graph coordinates.
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(() => ({
    left: 0,
    top: 0,
    width: GRAPH_WIDTH,
    height: GRAPH_HEIGHT,
    right: GRAPH_WIDTH,
    bottom: GRAPH_HEIGHT,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  }));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function setup(c: Clip | null = clip(), playheadUs = 0) {
  const onChange = vi.fn<(op: Op, key: string | undefined) => void>();
  const onSeek = vi.fn<(us: number) => void>();
  render(
    <GraphEditor
      clip={c ?? undefined}
      playheadUs={playheadUs}
      onChange={onChange}
      onSeek={onSeek}
    />,
  );
  return { onChange, onSeek };
}
const keyDot = (i: number) =>
  must(document.querySelector<SVGElement>(`[data-graph-key="${String(i)}"]`));

describe("GraphEditor", () => {
  it("explains itself without a clip and without keyframes", () => {
    setup(null);
    expect(screen.getByText(/Select a clip with keyframes/)).toBeTruthy();
    cleanup();
    setup(createClip({ id: "x", type: "solid" }));
    expect(screen.getByText(/no keyframes yet/)).toBeTruthy();
  });

  it("lists the animated properties and draws the curve and one dot per keyframe", () => {
    setup();
    expect(screen.getByRole("button", { name: "Opacity" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getAllByTestId("graph-curve")).toHaveLength(1);
    expect(document.querySelectorAll("[data-graph-key]")).toHaveLength(3);
  });

  it("draws a curve per channel for points", () => {
    const c = createClip({
      id: "c",
      type: "solid",
      outUs: 2 * SEC,
      keyframes: {
        "transform.position": [
          { tUs: 0, value: [0, 0], interpolation: "linear" },
          { tUs: SEC, value: [10, 20], interpolation: "linear" },
        ],
      },
    });
    setup(c);
    expect(screen.getAllByTestId("graph-curve")).toHaveLength(2);
  });

  it("shows the playhead only when it is on the clip", () => {
    setup(clip(), 2 * SEC);
    expect(screen.getByTestId("graph-playhead")).toBeTruthy();
    cleanup();
    setup(clip(), 9 * SEC);
    expect(screen.queryByTestId("graph-playhead")).toBeNull();
  });

  it("switches between the value and the speed graph", () => {
    setup();
    const speed = screen.getByRole("button", { name: "Speed graph" });
    fireEvent.click(speed);
    expect(speed.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Value graph" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  it("selecting a keyframe shows it, and enables the preset buttons", () => {
    setup();
    const bounce = screen.getByRole<HTMLButtonElement>("button", { name: "Bounce" });
    expect(bounce.disabled).toBe(true);
    fireEvent.pointerDown(keyDot(1), { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });
    expect(keyDot(1).getAttribute("data-selected")).toBe("true");
    expect(screen.getByTestId("graph-readout").textContent).toMatch(/Keyframe at 1\.00 s/);
    expect(bounce.disabled).toBe(false);
  });

  it("a preset becomes one op (a batch when it adds keyframes)", () => {
    const { onChange } = setup();
    fireEvent.pointerDown(keyDot(0), { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Ease in and out" }));
    const op = must(onChange.mock.calls.at(-1))[0];
    expect(op.type).toBe("batch");
    onChange.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Bounce" }));
    const bounce = must(onChange.mock.calls.at(-1))[0];
    expect(bounce.type).toBe("batch");
    expect((bounce as { ops: Op[] }).ops.some((o) => o.type === "addKeyframe")).toBe(true);
  });

  it("dragging a number keyframe moves it in time and value, as one coalesced update", () => {
    const { onChange } = setup();
    const dot = keyDot(1);
    const x = Number(dot.getAttribute("x")) + 5;
    const y = Number(dot.getAttribute("y")) + 5;
    fireEvent.pointerDown(dot, { clientX: x, clientY: y, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: x + 40, clientY: y + 30, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: x + 50, clientY: y + 30, pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });
    expect(onChange).toHaveBeenCalled();
    const [op, coalesce] = must(onChange.mock.calls[0]);
    expect(op).toMatchObject({ type: "updateKeyframe", clipId: "c", path: "opacity", tUs: SEC });
    const moved = (op as { keyframe: Keyframe }).keyframe;
    expect(moved.tUs).toBeGreaterThan(SEC); // moved later
    expect(moved.value as number).toBeLessThan(1); // moved down
    expect(coalesce).toBe("graph:c:opacity:1:key");
    // Every move of this drag shares the key: one undo step.
    expect(new Set(onChange.mock.calls.map((c) => c[1])).size).toBe(1);
  });

  it("dragging an ease handle in the speed graph sets influence and speed", () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Speed graph" }));
    fireEvent.pointerDown(keyDot(0), { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });
    const handle = must(document.querySelector<SVGElement>('[data-graph-handle="out"]'));
    const x = Number(handle.getAttribute("cx"));
    const y = Number(handle.getAttribute("cy"));
    fireEvent.pointerDown(handle, { clientX: x, clientY: y, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: x + 60, clientY: y - 20, pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });
    const [op, coalesce] = must(onChange.mock.calls.at(-1));
    expect(op).toMatchObject({ type: "updateKeyframe", tUs: 0 });
    const { easeOut } = (op as { keyframe: Keyframe }).keyframe;
    expect(easeOut?.influence).toBeGreaterThan(33.4); // dragged right: more influence
    expect(coalesce).toBe("graph:c:opacity:0:out");
  });

  it("removes the selected keyframe", () => {
    const { onChange } = setup();
    fireEvent.pointerDown(keyDot(2), { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Remove keyframe" }));
    expect(must(onChange.mock.calls.at(-1))[0]).toEqual({
      type: "removeKeyframe",
      clipId: "c",
      path: "opacity",
      tUs: 2 * SEC,
    });
  });

  it("clicking the empty graph moves the playhead to that time", () => {
    const { onSeek } = setup();
    const svg = screen.getByTestId("graph-svg");
    fireEvent.pointerDown(svg, { clientX: GRAPH_WIDTH / 2, clientY: 100, pointerId: 1 });
    expect(onSeek).toHaveBeenCalledTimes(1);
    const at = must(onSeek.mock.calls[0])[0];
    expect(at).toBeGreaterThan(SEC + 0.9 * SEC); // clip starts at 1 s, is 2 s long: middle ≈ 2 s
    expect(at).toBeLessThan(SEC + 1.1 * SEC);
  });
});
