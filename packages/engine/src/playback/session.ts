import type { Project } from "@lumacut/schema";
import { AudioEngine } from "../audio/audio-engine.ts";
import type { MediaResolver } from "../decode/media.ts";
import type { Diagnostic } from "../render/diagnostics.ts";
import type { ReadbackRenderResult } from "../render/engine.ts";
import type { ScopeSample } from "../scopes/compute.ts";
import type { StatsSnapshot } from "../stats.ts";
import { EngineClient } from "../worker/engine-client.ts";
import { audioContextClock, createPlaybackContext } from "./clock.ts";
import { PlaybackController, type FramePort } from "./controller.ts";

export interface FrameInfo {
  tUs: number;
  renderMs: number;
  /** Playback frames replaced by newer requests so far. */
  dropped: number;
  diagnostics: Diagnostic[];
  /** Playhead (audio clock) minus the frame's time while playing; null when paused. */
  offsetUs: number | null;
}

export interface PlaybackSessionCallbacks {
  /** Play state or playhead moved by a command (not every frame while playing). */
  onChange: () => void;
  onFrame: (info: FrameInfo) => void;
  onError: (message: string) => void;
}

export interface PlaybackSessionOptions {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  resolver: MediaResolver;
  /** The composition to play (the project's main one is not assumed). */
  compositionId: string;
  callbacks: PlaybackSessionCallbacks;
  /** Absolute URL of the folder with the bundled fonts (default: `/fonts/` on this origin). */
  fontBaseUrl?: string;
}

/**
 * Everything needed to play a composition on a page: the engine worker (picture), the audio engine and
 * the playback controller (sound + clock), wired together. UI code (and the render page) talk only
 * to this class.
 */
export class PlaybackSession {
  readonly #client: EngineClient;
  readonly #context: AudioContext;
  readonly #audio: AudioEngine;
  readonly #callbacks: PlaybackSessionCallbacks;
  readonly #compositionId: string;
  readonly #offs: (() => void)[] = [];
  #controller: PlaybackController | null = null;
  #offController: (() => void) | null = null;
  #durationUs = 0;
  #disposed = false;

  private constructor(
    client: EngineClient,
    context: AudioContext,
    audio: AudioEngine,
    compositionId: string,
    callbacks: PlaybackSessionCallbacks,
  ) {
    this.#client = client;
    this.#compositionId = compositionId;
    this.#context = context;
    this.#audio = audio;
    this.#callbacks = callbacks;
  }

  static async create(options: PlaybackSessionOptions): Promise<PlaybackSession> {
    const client = await EngineClient.create({
      canvas: options.canvas,
      resolver: options.resolver,
      ...(options.fontBaseUrl === undefined ? {} : { fontBaseUrl: options.fontBaseUrl }),
    });
    const context = createPlaybackContext();
    const audio = new AudioEngine({ context, resolver: options.resolver });
    const session = new PlaybackSession(
      client,
      context,
      audio,
      options.compositionId,
      options.callbacks,
    );
    session.#offs.push(
      client.onPresented((event) => {
        session.#callbacks.onFrame({
          tUs: event.tUs,
          renderMs: event.renderMs,
          dropped: event.dropped,
          diagnostics: event.diagnostics,
          offsetUs: session.playing ? session.timeUs - event.tUs : null,
        });
      }),
      client.onFrameError((error) => {
        session.#callbacks.onError(error.message);
      }),
    );
    return session;
  }

  get playing(): boolean {
    return this.#controller?.playing ?? false;
  }

  get timeUs(): number {
    return this.#controller?.timeUs ?? 0;
  }

  get durationUs(): number {
    return this.#durationUs;
  }

  /** Shows `project`; keeps the playhead where it was (clamped) and stops playback. */
  async setProject(project: Project): Promise<void> {
    const keep = this.timeUs;
    this.pause();
    this.#offController?.();
    this.#controller?.dispose();
    await this.#client.setProject(project);
    this.#audio.setProject(project);
    const durationUs = project.compositions.find((c) => c.id === this.#compositionId)?.durationUs;
    this.#durationUs = durationUs ?? 0;
    const frames: FramePort = {
      requestFrame: (comp, t) => {
        this.#client.requestFrame(comp, t);
      },
      renderNow: async (comp, t) => {
        const result = await this.#client.renderAt(comp, t);
        this.#callbacks.onFrame({
          tUs: t,
          renderMs: result.renderMs,
          dropped: 0,
          diagnostics: result.diagnostics,
          offsetUs: null,
        });
        return result;
      },
    };
    const controller = new PlaybackController({
      compositionId: this.#compositionId,
      durationUs: this.#durationUs,
      frames,
      audio: this.#audio,
      clock: audioContextClock(this.#context),
    });
    this.#controller = controller;
    this.#offController = controller.onChange(() => {
      this.#callbacks.onChange();
    });
    await controller.seek(Math.min(keep, this.#durationUs));
  }

  async play(): Promise<void> {
    // Browsers only let audio run after a user gesture; this is called from one.
    await this.#context.resume();
    await this.#controller?.play();
  }

  pause(): void {
    this.#controller?.pause();
  }

  async seek(us: number): Promise<void> {
    await this.#controller?.seek(us);
  }

  /** Renders the frame at the playhead and reads its pixels back (premultiplied RGBA8, top-left). */
  readPixels(): Promise<ReadbackRenderResult> {
    return this.#client.renderAt(this.#compositionId, this.timeUs, { readback: true });
  }

  /** The picture at the playhead shrunk to `width` pixels across, for the video scopes. */
  async readScope(width = 320): Promise<ScopeSample> {
    const result = await this.#client.renderAt(this.#compositionId, this.timeUs, {
      scopeWidth: width,
    });
    if (result.scope === undefined) throw new Error("The engine returned no scope sample");
    return result.scope;
  }

  /** Same, at an explicit time: for inspection and benchmarks, it doesn't move the playhead. */
  renderAt(tUs: number): Promise<ReadbackRenderResult> {
    return this.#client.renderAt(this.#compositionId, tUs, { readback: true });
  }

  snapshot(): Promise<StatsSnapshot> {
    return this.#client.snapshot();
  }

  /** Stops everything; resolves with the engine's final statistics, or null if already disposed. */
  async dispose(): Promise<StatsSnapshot | null> {
    if (this.#disposed) return null;
    this.#disposed = true;
    this.#offController?.();
    this.#controller?.dispose();
    for (const off of this.#offs) off();
    await this.#audio.dispose();
    await this.#context.close();
    return this.#client.dispose();
  }
}
