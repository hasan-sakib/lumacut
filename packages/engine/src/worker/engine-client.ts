import type { Project } from "@lumacut/schema";
import type { MediaResolver } from "../decode/media.ts";
import type { ReadbackRenderResult, RenderResult } from "../render/engine.ts";
import type { EngineLimits, StatsSnapshot } from "../stats.ts";
import type { PresentedEvent } from "./engine-host.ts";
import { Rpc } from "./rpc.ts";

export interface EngineClientOptions {
  /** The visible canvas; its control is transferred to the worker. */
  canvas: HTMLCanvasElement | OffscreenCanvas;
  resolver: MediaResolver;
  limits?: Partial<EngineLimits>;
  /** Supply your own Worker (tests, custom bundling). */
  worker?: Worker;
}

export interface FrameError {
  compositionId: string;
  tUs: number;
  message: string;
}

/**
 * The page's handle on an engine running in a Web Worker. Same operations as `Engine`, plus
 * `requestFrame` (latest request wins, used by playback) and presented-frame events.
 */
export class EngineClient {
  readonly #worker: Worker;
  readonly #rpc: Rpc;

  private constructor(worker: Worker, resolver: MediaResolver) {
    this.#worker = worker;
    this.#rpc = new Rpc(worker, {
      resolveMedia: async (payload: {
        assetId: string;
        kind: Parameters<MediaResolver["resolve"]>[1];
      }) => ({
        result: await resolver.resolve(payload.assetId, payload.kind),
      }),
    });
  }

  static async create(options: EngineClientOptions): Promise<EngineClient> {
    const worker =
      options.worker ??
      new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" });
    const client = new EngineClient(worker, options.resolver);
    const offscreen =
      options.canvas instanceof OffscreenCanvas
        ? options.canvas
        : options.canvas.transferControlToOffscreen();
    await client.#rpc.call("init", { canvas: offscreen, limits: options.limits }, [offscreen]);
    return client;
  }

  setProject(project: Project): Promise<void> {
    return this.#rpc.call("setProject", { project });
  }

  renderAt(
    compositionId: string,
    tUs: number,
    options: { readback: true },
  ): Promise<ReadbackRenderResult>;
  renderAt(
    compositionId: string,
    tUs: number,
    options?: { readback?: boolean },
  ): Promise<RenderResult>;
  renderAt(
    compositionId: string,
    tUs: number,
    options: { readback?: boolean } = {},
  ): Promise<RenderResult> {
    return this.#rpc.call("renderAt", { compositionId, tUs, readback: options.readback === true });
  }

  /** Asks for a frame without waiting; a newer request replaces one that hasn't started. */
  requestFrame(compositionId: string, tUs: number): void {
    this.#rpc.notify("requestFrame", { compositionId, tUs });
  }

  /** Resolves when every requested frame has been presented or dropped. */
  flush(): Promise<void> {
    return this.#rpc.call("flush");
  }

  onPresented(listener: (event: PresentedEvent) => void): () => void {
    return this.#rpc.on("presented", listener);
  }

  onFrameError(listener: (error: FrameError) => void): () => void {
    return this.#rpc.on("frameError", listener);
  }

  snapshot(): Promise<StatsSnapshot> {
    return this.#rpc.call("snapshot");
  }

  /** Shuts the engine down; resolves with its final statistics (all counters settled). */
  async dispose(): Promise<StatsSnapshot> {
    try {
      return await this.#rpc.call<StatsSnapshot>("dispose");
    } finally {
      this.#rpc.dispose();
      this.#worker.terminate();
    }
  }
}
