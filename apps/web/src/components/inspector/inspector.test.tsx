import {
  createClip,
  createComposition,
  createProject,
  createTrack,
  type Asset,
} from "@lumacut/schema";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClipInfo } from "../../inspector/fields.ts";
import { Inspector } from "./Inspector.tsx";
import { ScrubNumber } from "./ScrubNumber.tsx";
import { must } from "../../lib/must.ts";

afterEach(cleanup);

describe("ScrubNumber", () => {
  const setup = (over: Partial<Parameters<typeof ScrubNumber>[0]> = {}) => {
    const onCommit = vi.fn();
    render(
      <ScrubNumber
        label="Opacity"
        value={50}
        unit="%"
        step={1}
        min={0}
        max={100}
        onCommit={onCommit}
        {...over}
      />,
    );
    return {
      onCommit,
      input: screen.getByRole<HTMLInputElement>("textbox", { name: "Opacity" }),
    };
  };

  it("shows the value and applies a typed number on Enter", () => {
    const { onCommit, input } = setup();
    expect(input.value).toBe("50");
    fireEvent.change(input, { target: { value: "75" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith(75, "type");
  });

  it("does typed maths from the current value: +10, *2, /2", () => {
    for (const [text, expected] of [
      ["+10", 60],
      ["*1.5", 75],
      ["/2", 25],
    ] as const) {
      const { onCommit, input } = setup();
      fireEvent.change(input, { target: { value: text } });
      fireEvent.keyDown(input, { key: "Enter" });
      expect(onCommit).toHaveBeenCalledWith(expected, "type");
      cleanup();
    }
  });

  it("clamps to the limits", () => {
    const { onCommit, input } = setup();
    fireEvent.change(input, { target: { value: "500" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith(100, "type");
  });

  it("explains text that isn't a number and applies nothing; Escape puts the old value back", () => {
    const { onCommit, input } = setup();
    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByRole("alert").textContent).toMatch(/isn't a number/);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.value).toBe("50");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("leaving the field applies what was typed", () => {
    const { onCommit, input } = setup();
    fireEvent.change(input, { target: { value: "20" } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith(20, "type");
  });

  it("arrow keys step, Shift ×10, Alt ×0.1", () => {
    const { onCommit, input } = setup();
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(onCommit).toHaveBeenLastCalledWith(51, "step");
    fireEvent.keyDown(input, { key: "ArrowDown", shiftKey: true });
    expect(onCommit).toHaveBeenLastCalledWith(40, "step");
    fireEvent.keyDown(input, { key: "ArrowUp", altKey: true });
    expect(onCommit).toHaveBeenLastCalledWith(50.1, "step");
  });

  it("dragging the label scrubs: one step per pixel, Shift ×10, stops on release", () => {
    const { onCommit } = setup();
    const label = must(document.querySelector('[data-scrub="Opacity"]'));
    fireEvent.pointerDown(label, { clientX: 100, button: 0, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 110, pointerId: 1 });
    expect(onCommit).toHaveBeenLastCalledWith(60, "scrub");
    fireEvent.pointerMove(window, { clientX: 102, shiftKey: true, pointerId: 1 });
    expect(onCommit).toHaveBeenLastCalledWith(70, "scrub");
    fireEvent.pointerMove(window, { clientX: 400, pointerId: 1 });
    expect(onCommit).toHaveBeenLastCalledWith(100, "scrub"); // clamped
    fireEvent.pointerUp(window, { pointerId: 1 });
    const calls = onCommit.mock.calls.length;
    fireEvent.pointerMove(window, { clientX: 10, pointerId: 1 });
    expect(onCommit).toHaveBeenCalledTimes(calls);
  });

  it("a mixed value shows 'Mixed' and still accepts input; read-only shows text without an input", () => {
    const { input } = setup({ value: undefined, mixed: true });
    expect(input.value).toBe("");
    expect(input.placeholder).toBe("Mixed");
    cleanup();
    render(
      <ScrubNumber
        label="Duration"
        value={2.5}
        unit="s"
        step={1}
        readOnly
        onCommit={() => undefined}
      />,
    );
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByTestId("field-Duration").textContent).toBe("2.5 s");
  });
});

// --- Inspector --------------------------------------------------------------------------------

const SEC = 1_000_000;
const video: Asset = {
  id: "v1",
  kind: "video",
  name: "beach.mp4",
  mimeType: "video/mp4",
  sizeBytes: 1,
  source: "user",
  video: {
    width: 1920,
    height: 1080,
    fps: { num: 30, den: 1 },
    durationUs: 10 * SEC,
    codec: "avc1",
  },
};

function selection() {
  const a = createClip({
    id: "a",
    type: "media",
    assetId: "v1",
    startUs: 0,
    outUs: 2 * SEC,
    opacity: 0.5,
  });
  const b = createClip({
    id: "b",
    type: "media",
    assetId: "v1",
    startUs: 2 * SEC,
    outUs: 2 * SEC,
    opacity: 1,
  });
  const track = createTrack({ id: "V1", kind: "visual", clips: [a, b] });
  const composition = createComposition({
    id: "main",
    name: "Main",
    width: 1920,
    height: 1080,
    durationUs: 4 * SEC,
    tracks: [track],
  });
  createProject({
    id: "p",
    now: "2026-11-06T00:00:00Z",
    assets: [video],
    compositions: [composition],
    mainCompositionId: "main",
  });
  const info = (clip: typeof a): ClipInfo => ({ clip, track, asset: video });
  return { composition, a: info(a), b: info(b) };
}

describe("Inspector", () => {
  it("with nothing selected shows the composition's settings and a hint", () => {
    const { composition } = selection();
    render(<Inspector composition={composition} items={[]} onChange={() => undefined} />);
    expect(screen.getByText("Main")).toBeTruthy();
    expect(screen.getByText(/1920×1080/)).toBeTruthy();
    expect(screen.getByText(/Select a clip/)).toBeTruthy();
  });

  it("shows the clip's name and only the sections that apply", () => {
    const { composition, a } = selection();
    render(<Inspector composition={composition} items={[a]} onChange={() => undefined} />);
    expect(screen.getByTestId("inspector-title").textContent).toBe("beach.mp4");
    for (const name of ["Transform", "Opacity & blend", "Crop", "Time"]) {
      expect(screen.getByRole("region", { name })).toBeTruthy();
    }
    expect(screen.queryByRole("region", { name: "Audio" })).toBeNull();
  });

  it("typing a value applies one setProps; scrubbing and stepping carry a coalesce key, typing doesn't", () => {
    const { composition, a } = selection();
    const onChange = vi.fn();
    render(<Inspector composition={composition} items={[a]} onChange={onChange} />);
    const opacity = screen.getByRole("textbox", { name: "Opacity" });
    fireEvent.change(opacity, { target: { value: "75" } });
    fireEvent.keyDown(opacity, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith(
      { type: "setProps", clipId: "a", props: { opacity: 0.75 } },
      undefined,
    );
    fireEvent.keyDown(opacity, { key: "ArrowUp" });
    expect(onChange).toHaveBeenLastCalledWith(
      { type: "setProps", clipId: "a", props: { opacity: 0.51 } },
      "inspector:opacity",
    );
    const label = must(document.querySelector('[data-scrub="Opacity"]'));
    fireEvent.pointerDown(label, { clientX: 0, button: 0, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 10, pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });
    expect(onChange).toHaveBeenLastCalledWith(
      { type: "setProps", clipId: "a", props: { opacity: 0.6 } },
      "inspector:opacity",
    );
  });

  it("a choice (blend mode) and a switch (reverse) apply immediately", () => {
    const { composition, a } = selection();
    const onChange = vi.fn();
    render(<Inspector composition={composition} items={[a]} onChange={onChange} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "multiply" } });
    expect(onChange).toHaveBeenLastCalledWith(
      { type: "setProps", clipId: "a", props: { blendMode: "multiply" } },
      undefined,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Reverse" }));
    expect(onChange).toHaveBeenLastCalledWith(
      { type: "setProps", clipId: "a", props: { reversed: true } },
      undefined,
    );
  });

  it("changing nothing (same value) applies nothing", () => {
    const { composition, a } = selection();
    const onChange = vi.fn();
    render(<Inspector composition={composition} items={[a]} onChange={onChange} />);
    const opacity = screen.getByRole("textbox", { name: "Opacity" });
    fireEvent.change(opacity, { target: { value: "50" } });
    fireEvent.keyDown(opacity, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("with several clips selected, differing values show Mixed and an edit applies to all as one batch", () => {
    const { composition, a, b } = selection();
    const onChange = vi.fn();
    render(<Inspector composition={composition} items={[a, b]} onChange={onChange} />);
    expect(screen.getByTestId("inspector-title").textContent).toBe("2 clips selected");
    const opacity = screen.getByRole<HTMLInputElement>("textbox", { name: "Opacity" });
    expect(opacity.placeholder).toBe("Mixed");
    fireEvent.change(opacity, { target: { value: "30" } });
    fireEvent.keyDown(opacity, { key: "Enter" });
    const [op] = onChange.mock.calls.at(-1) as [{ type: string; ops: { clipId: string }[] }];
    expect(op.type).toBe("batch");
    expect(op.ops.map((o) => o.clipId)).toEqual(["a", "b"]);
  });

  it("advanced fields hide behind a per-section switch", () => {
    const { composition, a } = selection();
    render(<Inspector composition={composition} items={[a]} onChange={() => undefined} />);
    expect(screen.queryByRole("textbox", { name: "Skew" })).toBeNull();
    const transform = screen.getByRole("region", { name: "Transform" });
    fireEvent.click(within(transform).getByRole("button", { name: /Advanced \(5\)/ }));
    expect(screen.getByRole("textbox", { name: "Skew" })).toBeTruthy();
    fireEvent.click(within(transform).getByRole("button", { name: "Basic" }));
    expect(screen.queryByRole("textbox", { name: "Skew" })).toBeNull();
  });

  it("search finds fields by what they do, including advanced ones, and says when nothing matches", () => {
    const { composition, a } = selection();
    render(<Inspector composition={composition} items={[a]} onChange={() => undefined} />);
    const search = screen.getByRole("searchbox", { name: "Search properties" });
    fireEvent.change(search, { target: { value: "slant" } });
    expect(screen.getByRole("textbox", { name: "Skew" })).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Opacity" })).toBeNull();
    fireEvent.change(search, { target: { value: "xyzzy" } });
    expect(screen.getByText(/No property matches/)).toBeTruthy();
    fireEvent.keyDown(search, { key: "Escape" });
    expect((search as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("textbox", { name: "Opacity" })).toBeTruthy();
  });

  it("sections collapse and expand", () => {
    const { composition, a } = selection();
    render(<Inspector composition={composition} items={[a]} onChange={() => undefined} />);
    const crop = screen.getByRole("region", { name: "Crop" });
    expect(within(crop).getByRole("textbox", { name: "Crop left" })).toBeTruthy();
    fireEvent.click(within(crop).getByRole("button", { name: /Crop/ }));
    expect(within(crop).queryByRole("textbox", { name: "Crop left" })).toBeNull();
    expect(within(crop).getByRole("button", { name: /Crop/ }).getAttribute("aria-expanded")).toBe(
      "false",
    );
  });
});
