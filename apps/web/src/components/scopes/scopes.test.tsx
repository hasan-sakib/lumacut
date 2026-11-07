import type { ScopeSample } from "@lumacut/engine/scopes";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SCOPE_H, SCOPE_W, drawScope } from "./render.ts";
import { ScopesPanel } from "./ScopesPanel.tsx";

/** A canvas 2D context that records what was drawn (jsdom has no canvas). */
function fakeContext() {
  const painted: { data: Uint8ClampedArray }[] = [];
  const ctx = {
    createImageData: (w: number, h: number) => ({
      width: w,
      height: h,
      data: new Uint8ClampedArray(w * h * 4),
    }),
    putImageData: (image: { data: Uint8ClampedArray }) => {
      painted.push(image);
    },
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    strokeStyle: "",
    fillStyle: "",
    font: "",
    lineWidth: 1,
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, painted };
}

const solid = (r: number, g: number, b: number, w = 16, h = 9): ScopeSample => {
  const pixels = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) pixels.set([r, g, b, 255], i * 4);
  return { width: w, height: h, pixels };
};

describe("drawScope", () => {
  const paint = (kind: Parameters<typeof drawScope>[1], sample: ScopeSample) => {
    const { ctx, painted } = fakeContext();
    drawScope(ctx, kind, sample);
    const image = painted[0];
    if (image === undefined) throw new Error("nothing was painted");
    return image.data;
  };
  const at = (data: Uint8ClampedArray, x: number, y: number) =>
    Array.from(data.subarray((y * SCOPE_W + x) * 4, (y * SCOPE_W + x) * 4 + 3));

  it("a waveform of a flat mid-grey is a horizontal line halfway down", () => {
    const data = paint("waveform", solid(128, 128, 128));
    const rows: number[] = [];
    for (let y = 0; y < SCOPE_H; y++) if ((at(data, 100, y)[1] ?? 0) > 0) rows.push(y);
    expect(rows.length).toBeGreaterThan(0);
    for (const y of rows) expect(Math.abs(y - SCOPE_H / 2)).toBeLessThanOrEqual(2);
  });

  it("the parade colours red, green and blue in their own thirds", () => {
    const data = paint("parade", solid(255, 255, 255));
    const third = Math.floor(SCOPE_W / 3);
    const top = 0; // level 255 is the top row
    const [r1 = 0, g1 = 0] = at(data, 10, top); // red third is tinted red
    expect(r1).toBeGreaterThan(g1);
    const [r2 = 0, g2 = 0] = at(data, third + 10, top); // green third
    expect(g2).toBeGreaterThan(r2);
    const [r3 = 0, , b3 = 0] = at(data, third * 2 + 10, top); // blue third
    expect(b3).toBeGreaterThan(r3);
  });

  it("the histogram of pure red fills only the red channel's bar", () => {
    const data = paint("histogram", solid(255, 0, 0));
    const bottom = SCOPE_H - 1;
    expect(at(data, SCOPE_W - 1, bottom)[0]).toBeGreaterThan(0); // red at level 255
    expect(at(data, 0, bottom)[1]).toBeGreaterThan(0); // green and blue at level 0
    expect(at(data, 0, bottom)[2]).toBeGreaterThan(0);
  });

  it("a vectorscope of grey is one dot in the centre", () => {
    const data = paint("vectorscope", solid(100, 100, 100));
    const lit: number[] = [];
    for (let y = 0; y < SCOPE_H; y++) {
      for (let x = 0; x < SCOPE_W; x++) if ((at(data, x, y)[1] ?? 0) > 0) lit.push(x, y);
    }
    expect(lit.length).toBeGreaterThan(0);
    expect(lit[0]).toBeGreaterThan(SCOPE_W / 2 - 4);
    expect(lit[0]).toBeLessThan(SCOPE_W / 2 + 4);
    expect(lit[1]).toBeGreaterThan(SCOPE_H / 2 - 4);
    expect(lit[1]).toBeLessThan(SCOPE_H / 2 + 4);
  });
});

describe("ScopesPanel", () => {
  let drawn: ReturnType<typeof fakeContext>;
  beforeEach(() => {
    vi.useFakeTimers();
    drawn = fakeContext();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => drawn.ctx);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("reads the picture shrunk to the scope width and draws it", async () => {
    const readScope = vi
      .fn<(w?: number) => Promise<ScopeSample | null>>()
      .mockResolvedValue(solid(10, 20, 30));
    render(<ScopesPanel readScope={readScope} playheadUs={0} project={{}} playing={false} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(readScope).toHaveBeenCalledWith(SCOPE_W);
    expect(drawn.painted.length).toBeGreaterThan(0);
  });

  it("refreshes when the playhead moves, and not more often than its throttle allows", async () => {
    const readScope = vi
      .fn<(w?: number) => Promise<ScopeSample | null>>()
      .mockResolvedValue(solid(1, 2, 3));
    const { rerender } = render(
      <ScopesPanel readScope={readScope} playheadUs={0} project={{}} playing={false} />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    const before = readScope.mock.calls.length;
    rerender(<ScopesPanel readScope={readScope} playheadUs={1000} project={{}} playing={false} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(readScope.mock.calls.length).toBe(before + 1);
  });

  it("polls while playing", async () => {
    const readScope = vi
      .fn<(w?: number) => Promise<ScopeSample | null>>()
      .mockResolvedValue(solid(1, 2, 3));
    render(<ScopesPanel readScope={readScope} playheadUs={0} project={{}} playing />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1300);
    });
    expect(readScope.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("switching the scope redraws the last picture and marks the choice", async () => {
    const readScope = vi
      .fn<(w?: number) => Promise<ScopeSample | null>>()
      .mockResolvedValue(solid(200, 10, 10));
    render(<ScopesPanel readScope={readScope} playheadUs={0} project={{}} playing={false} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    const paintedBefore = drawn.painted.length;
    fireEvent.click(screen.getByRole("button", { name: "Vectorscope" }));
    expect(screen.getByRole("button", { name: "Vectorscope" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(drawn.painted.length).toBeGreaterThan(paintedBefore);
    expect(screen.getByRole("img", { name: "Vectorscope" })).toBeTruthy();
  });

  it("shows a failure instead of a stale picture", async () => {
    const readScope = vi
      .fn<(w?: number) => Promise<ScopeSample | null>>()
      .mockRejectedValue(new Error("gpu lost"));
    render(<ScopesPanel readScope={readScope} playheadUs={0} project={{}} playing={false} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(screen.getByRole("alert").textContent).toMatch(/gpu lost/);
  });

  it("does nothing while the preview isn't ready", async () => {
    const readScope = vi.fn<(w?: number) => Promise<ScopeSample | null>>().mockResolvedValue(null);
    render(<ScopesPanel readScope={readScope} playheadUs={0} project={{}} playing={false} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(drawn.painted).toHaveLength(0);
  });
});
