import type { VideoSample } from "mediabunny";
import type { EngineStats } from "../stats.ts";

/**
 * A decoded frame whose lifetime is counted. `close()` is idempotent and every `VideoFrame`
 * derived from it is closed before `withVideoFrame` returns, so opened == closed always holds
 * once the owner is done (rule 7).
 */
export class TrackedFrame {
  readonly index: number;
  readonly width: number;
  readonly height: number;
  readonly #stats: EngineStats;
  #sample: VideoSample | null;

  constructor(sample: VideoSample, index: number, stats: EngineStats) {
    this.#sample = sample;
    this.#stats = stats;
    this.index = index;
    this.width = sample.displayWidth;
    this.height = sample.displayHeight;
    stats.framesOpened += 1;
  }

  get closed(): boolean {
    return this.#sample === null;
  }

  withVideoFrame<T>(use: (frame: VideoFrame) => T): T {
    if (this.#sample === null) throw new Error(`Frame ${String(this.index)} is already closed`);
    const frame = this.#sample.toVideoFrame();
    this.#stats.framesOpened += 1;
    try {
      return use(frame);
    } finally {
      frame.close();
      this.#stats.framesClosed += 1;
    }
  }

  close(): void {
    if (this.#sample === null) return;
    this.#sample.close();
    this.#sample = null;
    this.#stats.framesClosed += 1;
  }
}
