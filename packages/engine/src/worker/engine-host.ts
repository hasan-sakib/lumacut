import type { Project } from "@lumacut/schema";
import type { MediaKind, MediaResolver } from "../decode/media.ts";
import { FrameScheduler } from "../playback/frame-scheduler.ts";
import { Engine, type RenderOptions, type RenderResult } from "../render/engine.ts";
import type { EngineLimits, StatsSnapshot } from "../stats.ts";
import { Rpc, type PortLike } from "./rpc.ts";

/** Summary of a presented frame, sent from the worker to the page (no pixels). */
export interface PresentedEvent {
  compositionId: string;
  tUs: number;
  renderMs: number;
  diagnostics: RenderResult["diagnostics"];
  /** Requests replaced by newer ones so far (dropped frames). */
  dropped: number;
}

export interface InitPayload {
  canvas: OffscreenCanvas;
  limits?: Partial<EngineLimits>;
  fontBaseUrl?: string;
}

/**
 * Runs inside the worker: owns the Engine and the canvas. The page asks for frames; media URLs
 * are fetched back from the page (it knows how to authenticate against the API).
 */
export class EngineHost {
  readonly #rpc: Rpc;
  #engine: Engine | null = null;
  #scheduler: FrameScheduler<RenderResult> | null = null;

  constructor(port: PortLike) {
    this.#rpc = new Rpc(port, {
      init: (payload: InitPayload) => {
        this.#init(payload);
        return undefined;
      },
      setProject: (payload: { project: Project }) => {
        this.#need().setProject(payload.project);
        return undefined;
      },
      renderAt: async (payload: {
        compositionId: string;
        tUs: number;
        readback?: boolean;
        scopeWidth?: number;
      }) => {
        // An explicit render (a seek) supersedes any playback frame still waiting its turn.
        this.#scheduler?.cancelPending();
        const options: RenderOptions = {
          ...(payload.readback === true ? { readback: true } : {}),
          ...(payload.scopeWidth === undefined ? {} : { scopeWidth: payload.scopeWidth }),
        };
        const result = await this.#need().renderAt(payload.compositionId, payload.tUs, options);
        const transfer: Transferable[] = [];
        if (result.pixels) transfer.push(result.pixels.buffer);
        if (result.scope) transfer.push(result.scope.pixels.buffer);
        return { result, transfer };
      },
      requestFrame: (payload: { compositionId: string; tUs: number }) => {
        this.#scheduler?.request(payload);
        return undefined;
      },
      flush: async () => {
        await this.#scheduler?.flush();
        return undefined;
      },
      snapshot: (): { result: StatsSnapshot } => ({ result: this.#need().snapshot() }),
      dispose: async (): Promise<{ result: StatsSnapshot } | undefined> => {
        await this.#scheduler?.flush();
        const engine = this.#engine;
        await engine?.dispose();
        this.#engine = null;
        // The final counters: the page can check that everything was closed and released.
        return engine === null ? undefined : { result: engine.snapshot() };
      },
    });
  }

  #need(): Engine {
    if (this.#engine === null) throw new Error("The engine isn't initialised");
    return this.#engine;
  }

  #init({ canvas, limits, fontBaseUrl }: InitPayload): void {
    const resolver: MediaResolver = {
      resolve: (assetId: string, kind: MediaKind) =>
        this.#rpc.call<string>("resolveMedia", { assetId, kind }),
    };
    const engine = Engine.create({
      canvas,
      resolver,
      ...(limits ? { limits } : {}),
      ...(fontBaseUrl === undefined ? {} : { fontBaseUrl }),
    });
    this.#engine = engine;
    this.#scheduler = new FrameScheduler<RenderResult>(
      (request) => engine.renderAt(request.compositionId, request.tUs),
      (request, result) => {
        const event: PresentedEvent = {
          compositionId: request.compositionId,
          tUs: request.tUs,
          renderMs: result.renderMs,
          diagnostics: result.diagnostics,
          dropped: this.#scheduler?.stats.dropped ?? 0,
        };
        this.#rpc.notify("presented", event);
      },
      (request, error) => {
        this.#rpc.notify("frameError", {
          compositionId: request.compositionId,
          tUs: request.tUs,
          message: error instanceof Error ? error.message : String(error),
        });
      },
    );
  }
}
