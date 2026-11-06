import type { ReadbackRenderResult, RenderOptions, RenderResult } from "../render/engine.ts";
import type { EngineClient } from "../worker/engine-client.ts";
import type { FramePort } from "./controller.ts";
import { FrameScheduler } from "./frame-scheduler.ts";

export interface RenderingEngine {
  renderAt(
    compositionId: string,
    tUs: number,
    options: RenderOptions & { readback: true },
  ): Promise<ReadbackRenderResult>;
  renderAt(compositionId: string, tUs: number, options?: RenderOptions): Promise<RenderResult>;
}

export interface EngineFramePortOptions<R> {
  /** Called with each frame that was actually rendered (not the dropped ones). */
  onPresented?: (compositionId: string, tUs: number, result: R) => void;
  onError?: (compositionId: string, tUs: number, error: unknown) => void;
}

/**
 * Frame requests for an engine running on this thread: latest request wins, and an explicit
 * `renderNow` (a seek) first cancels any playback frame that has not started.
 */
export class EngineFramePort implements FramePort {
  readonly scheduler: FrameScheduler<RenderResult>;
  readonly #engine: RenderingEngine;

  constructor(engine: RenderingEngine, options: EngineFramePortOptions<RenderResult> = {}) {
    this.#engine = engine;
    this.scheduler = new FrameScheduler<RenderResult>(
      (request) => engine.renderAt(request.compositionId, request.tUs),
      (request, result) => options.onPresented?.(request.compositionId, request.tUs, result),
      (request, error) => options.onError?.(request.compositionId, request.tUs, error),
    );
  }

  requestFrame(compositionId: string, tUs: number): void {
    this.scheduler.request({ compositionId, tUs });
  }

  renderNow(compositionId: string, tUs: number): Promise<RenderResult> {
    this.scheduler.cancelPending();
    return this.#engine.renderAt(compositionId, tUs);
  }

  flush(): Promise<void> {
    return this.scheduler.flush();
  }
}

/** The same contract for an engine in a Worker (the worker does the cancelling and coalescing). */
export class ClientFramePort implements FramePort {
  readonly #client: EngineClient;

  constructor(client: EngineClient) {
    this.#client = client;
  }

  requestFrame(compositionId: string, tUs: number): void {
    this.#client.requestFrame(compositionId, tUs);
  }

  renderNow(compositionId: string, tUs: number): Promise<RenderResult> {
    return this.#client.renderAt(compositionId, tUs);
  }
}
