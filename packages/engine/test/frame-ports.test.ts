import { describe, expect, it } from "vitest";
import { EngineFramePort, type RenderResult } from "../src/index.ts";

/**
 * A fake engine that renders one frame at a time in request order (like the real Engine's queue);
 * its first render blocks until released.
 */
function fakeEngine() {
  const order: number[] = [];
  let calls = 0;
  let open!: () => void;
  const gate = new Promise<void>((resolve) => {
    open = resolve; // created up front, so releasing early still works
  });
  let chain: Promise<unknown> = Promise.resolve();
  return {
    order,
    release: () => {
      open();
    },
    engine: {
      renderAt: (_comp: string, tUs: number): Promise<RenderResult> => {
        calls += 1;
        const first = calls === 1;
        const run = chain.then(async () => {
          if (first) await gate;
          order.push(tUs);
          return { compositionId: "m", tUs, width: 1, height: 1, diagnostics: [], renderMs: 0 };
        });
        chain = run.catch(() => undefined);
        return run;
      },
    } as never,
  };
}

describe("EngineFramePort", () => {
  it("a seek cancels a playback frame that hasn't started, so no stale picture follows it", async () => {
    const { engine, order, release } = fakeEngine();
    const presented: number[] = [];
    const port = new EngineFramePort(engine, { onPresented: (_c, t) => presented.push(t) });
    port.requestFrame("m", 100); // starts rendering and blocks
    port.requestFrame("m", 200); // waits its turn
    const seeking = port.renderNow("m", 9_000); // the seek: must cancel the waiting frame 200
    release();
    await seeking;
    await port.flush();
    expect(order).toEqual([100, 9_000]); // 200 never rendered, and never after the seek
    expect(presented).toEqual([100]);
    expect(port.scheduler.stats.dropped).toBe(1);
  });

  it("without a pending frame, renderNow just renders", async () => {
    const { engine, order, release } = fakeEngine();
    const port = new EngineFramePort(engine);
    const rendering = port.renderNow("m", 5);
    release();
    await rendering;
    expect(order).toEqual([5]);
  });
});
