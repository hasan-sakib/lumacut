import { createClip, neutralColor, type ColorSettings, type Vec2 } from "@lumacut/schema";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { must } from "../../lib/must.ts";
import { ColorExtras } from "./ColorExtras.tsx";
import { CurveEditor } from "./CurveEditor.tsx";
import { HslPanel } from "./HslPanel.tsx";
import { LutPicker } from "./LutPicker.tsx";

beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(() => ({
    left: 0,
    top: 0,
    width: 200,
    height: 200,
    right: 200,
    bottom: 200,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  }));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const diagonal: Vec2[] = [
  [0, 0],
  [1, 1],
];
// The SVG is 200 px with a 10 px margin: x = 10 + 180·u, y = 10 + 180·(1 − v).
const px = (u: number) => 10 + 180 * u;
const py = (v: number) => 10 + 180 * (1 - v);

describe("CurveEditor", () => {
  it("clicking empty space adds a point there and starts dragging it", () => {
    const onChange = vi.fn<(p: Vec2[], key: string) => void>();
    render(<CurveEditor name="master" points={diagonal} onChange={onChange} />);
    fireEvent.pointerDown(screen.getByTestId("curve-master"), {
      clientX: px(0.5),
      clientY: py(0.8),
      pointerId: 1,
    });
    const [points, key] = must(onChange.mock.calls[0]);
    expect(points).toHaveLength(3);
    expect(points[1]?.[0]).toBeCloseTo(0.5, 6);
    expect(points[1]?.[1]).toBeCloseTo(0.8, 6);
    expect(key).toBe("curve:master:1");
    fireEvent.pointerUp(window, { pointerId: 1 });
  });

  it("dragging a point moves it with one coalesce key per point", () => {
    const onChange = vi.fn<(p: Vec2[], key: string) => void>();
    const pts: Vec2[] = [
      [0, 0],
      [0.5, 0.5],
      [1, 1],
    ];
    render(<CurveEditor name="r" points={pts} onChange={onChange} />);
    const point = must(document.querySelector('[data-curve-point="1"]'));
    fireEvent.pointerDown(point, { clientX: px(0.5), clientY: py(0.5), pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: px(0.6), clientY: py(0.3), pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });
    const [moved, key] = must(onChange.mock.calls.at(-1));
    expect(moved[1]?.[0]).toBeCloseTo(0.6, 6);
    expect(moved[1]?.[1]).toBeCloseTo(0.3, 6);
    expect(key).toBe("curve:r:1");
  });

  it("double-clicking an inner point removes it, but not an end point", () => {
    const onChange = vi.fn<(p: Vec2[], key: string) => void>();
    const pts: Vec2[] = [
      [0, 0],
      [0.5, 0.5],
      [1, 1],
    ];
    render(<CurveEditor name="g" points={pts} onChange={onChange} />);
    fireEvent.doubleClick(must(document.querySelector('[data-curve-point="1"]')));
    expect(must(onChange.mock.calls.at(-1))[0]).toEqual(diagonal);
    fireEvent.doubleClick(must(document.querySelector('[data-curve-point="0"]')));
    expect(must(onChange.mock.calls.at(-1))[0]).toEqual(pts);
  });

  it("draws the curve and labels it", () => {
    render(
      <CurveEditor
        name="hueVsSat"
        points={[
          [0, 0.5],
          [1, 0.5],
        ]}
        onChange={() => undefined}
      />,
    );
    expect(screen.getByRole("img", { name: "Hue vs saturation curve" })).toBeTruthy();
    expect(screen.getByTestId("curve-line").getAttribute("points")?.split(" ").length).toBe(256);
  });
});

describe("HslPanel", () => {
  it("edits the picked colour range and leaves the others neutral", () => {
    const onChange = vi.fn<(c: ColorSettings, key: string | undefined) => void>();
    render(<HslPanel color={neutralColor()} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Blue range" }));
    const sat = screen.getByRole("textbox", { name: "Saturation" });
    fireEvent.change(sat, { target: { value: "40" } });
    fireEvent.keyDown(sat, { key: "Enter" });
    const [color] = must(onChange.mock.calls.at(-1));
    expect(color.hsl?.blue).toEqual({ hue: 0, saturation: 0.4, luminance: 0 });
    expect(color.hsl?.red).toEqual({ hue: 0, saturation: 0, luminance: 0 });
  });

  it("shows hue in degrees (±30°)", () => {
    const onChange = vi.fn<(c: ColorSettings, key: string | undefined) => void>();
    render(<HslPanel color={neutralColor()} onChange={onChange} />);
    const hue = screen.getByRole("textbox", { name: "Hue" });
    fireEvent.change(hue, { target: { value: "15" } });
    fireEvent.keyDown(hue, { key: "Enter" });
    expect(must(onChange.mock.calls.at(-1))[0].hsl?.red.hue).toBeCloseTo(0.5, 9);
  });
});

describe("LutPicker", () => {
  it("lists the built-in looks and the project's .cube files", () => {
    render(
      <LutPicker
        color={neutralColor()}
        assets={[{ id: "a1", name: "my-look.cube" }]}
        onChange={() => undefined}
      />,
    );
    const select = screen.getByRole("combobox", { name: "Look-up table" });
    expect(within(select).getByRole("option", { name: "Teal & orange" })).toBeTruthy();
    expect(within(select).getByRole("option", { name: "my-look.cube" })).toBeTruthy();
  });

  it("choosing a look applies it at full strength; None removes it", () => {
    const onChange = vi.fn<(c: ColorSettings, key: string | undefined) => void>();
    const { rerender } = render(
      <LutPicker color={neutralColor()} assets={[]} onChange={onChange} />,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Look-up table" }), {
      target: { value: "builtin:noir" },
    });
    const applied = must(onChange.mock.calls.at(-1))[0];
    expect(applied.lut).toEqual({ lutId: "builtin:noir", intensity: 1 });
    rerender(<LutPicker color={applied} assets={[]} onChange={onChange} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Look-up table" }), {
      target: { value: "" },
    });
    expect(must(onChange.mock.calls.at(-1))[0].lut).toBeUndefined();
  });

  it("intensity is a percentage", () => {
    const onChange = vi.fn<(c: ColorSettings, key: string | undefined) => void>();
    const color = { ...neutralColor(), lut: { lutId: "builtin:noir", intensity: 1 } };
    render(<LutPicker color={color} assets={[]} onChange={onChange} />);
    const box = screen.getByRole("textbox", { name: "Intensity" });
    fireEvent.change(box, { target: { value: "35" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(must(onChange.mock.calls.at(-1))[0].lut?.intensity).toBeCloseTo(0.35, 9);
  });

  it("a library LUT passes its asset along so it can be added to the project", () => {
    const onChange = vi.fn();
    const asset = {
      id: "lib1",
      kind: "lut" as const,
      name: "x.cube",
      mimeType: "text/plain",
      sizeBytes: 10,
      source: "user" as const,
    };
    render(
      <LutPicker
        color={neutralColor()}
        assets={[{ id: "lib1", name: "x.cube", addToProject: asset }]}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Look-up table" }), {
      target: { value: "lib1" },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      { ...neutralColor(), lut: { lutId: "lib1", intensity: 1 } },
      undefined,
      asset,
    );
  });

  it("says so when the LUT it was given isn't available", () => {
    const color = { ...neutralColor(), lut: { lutId: "gone", intensity: 1 } };
    render(<LutPicker color={color} assets={[]} onChange={() => undefined} />);
    expect(screen.getByRole("option", { name: "Missing: gone" })).toBeTruthy();
  });
});

describe("ColorExtras", () => {
  const clip = createClip({ id: "c", type: "media" });

  it("each change is one setProps on the clip's colour", () => {
    const onChange = vi.fn();
    render(<ColorExtras clip={clip} lutAssets={[]} onChange={onChange} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Look-up table" }), {
      target: { value: "builtin:sepia" },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      {
        type: "setProps",
        clipId: "c",
        props: { color: { ...neutralColor(), lut: { lutId: "builtin:sepia", intensity: 1 } } },
      },
      undefined,
    );
  });

  it("choosing a library LUT adds the asset and sets the look in one undo step", () => {
    const onChange = vi.fn();
    const asset = {
      id: "lib1",
      kind: "lut" as const,
      name: "x.cube",
      mimeType: "text/plain",
      sizeBytes: 10,
      source: "user" as const,
    };
    render(
      <ColorExtras
        clip={clip}
        lutAssets={[{ id: "lib1", name: "x.cube", addToProject: asset }]}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Look-up table" }), {
      target: { value: "lib1" },
    });
    const op = must(onChange.mock.calls.at(-1))[0] as { type: string; ops: { type: string }[] };
    expect(op.type).toBe("batch");
    expect(op.ops.map((o) => o.type)).toEqual(["addAsset", "setProps"]);
  });

  it("opens the curves and edits the chosen one", () => {
    const onChange = vi.fn();
    render(<ColorExtras clip={clip} lutAssets={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Curves" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Curve" }), { target: { value: "b" } });
    fireEvent.pointerDown(screen.getByTestId("curve-b"), {
      clientX: px(0.5),
      clientY: py(0.7),
      pointerId: 1,
    });
    fireEvent.pointerUp(window, { pointerId: 1 });
    const op = must(onChange.mock.calls.at(-1))[0] as { props: { color: ColorSettings } };
    expect(op.props.color.curves?.b).toHaveLength(3);
    expect(op.props.color.curves?.master).toEqual(diagonal);
  });

  it("Reset colour restores the neutral grade", () => {
    const onChange = vi.fn();
    const graded = createClip({
      id: "c",
      type: "media",
      color: { ...neutralColor(), exposure: 2 },
    });
    render(<ColorExtras clip={graded} lutAssets={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Reset colour" }));
    expect(must(onChange.mock.calls.at(-1))[0]).toEqual({
      type: "setProps",
      clipId: "c",
      props: { color: neutralColor() },
    });
  });
});
