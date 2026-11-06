import type { ClockSource } from "./clock.ts";

/** Where frames go. `requestFrame` is fire-and-forget (latest wins); `renderNow` waits. */
export interface FramePort {
  requestFrame(compositionId: string, tUs: number): void;
  renderNow(compositionId: string, tUs: number): Promise<unknown>;
}

/** Sound. `start` makes timeline time `fromUs` sound at context time `contextStartTime`. */
export interface AudioPort {
  start(compositionId: string, fromUs: number, contextStartTime: number): Promise<void>;
  scheduleUntil(untilUs: number): Promise<void>;
  stop(): Promise<void>;
}

export interface Timers {
  requestFrame(callback: () => void): number;
  cancelFrame(handle: number): void;
}

export interface PlaybackOptions {
  compositionId: string;
  durationUs: number;
  frames: FramePort;
  audio: AudioPort;
  clock: ClockSource;
  timers?: Timers;
  /** Seconds between `play()` and the first sound, so the first buffers are ready in time. */
  startLeadS?: number;
  /** How far ahead of the playhead audio is kept scheduled (µs). */
  lookaheadUs?: number;
}

const DEFAULT_LEAD_S = 0.08;
const DEFAULT_LOOKAHEAD_US = 1_000_000;

const browserTimers: Timers = {
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (handle) => {
    cancelAnimationFrame(handle);
  },
};

type Phase = "stopped" | "starting" | "playing";

/**
 * Play / pause / seek. While playing, the playhead is the audio clock (so picture can never drift
 * away from sound); each animation frame it asks for the picture at the clock's current time and
 * keeps the audio topped up. Rapid seeks are safe: the last one wins.
 */
export class PlaybackController {
  readonly #options: PlaybackOptions;
  readonly #timers: Timers;
  readonly #listeners = new Set<() => void>();
  #phase: Phase = "stopped";
  /** What the user asked for; survives a seek. */
  #wantsPlaying = false;
  #pausedUs = 0;
  #origin = { timelineUs: 0, contextTime: 0 };
  #raf: number | null = null;
  /** Bumped by every pause/seek so that slower, older operations notice they were superseded. */
  #epoch = 0;

  constructor(options: PlaybackOptions) {
    this.#options = options;
    this.#timers = options.timers ?? browserTimers;
  }

  /** True from `play()` until `pause()` (or the end), including while a seek is in progress. */
  get playing(): boolean {
    return this.#wantsPlaying;
  }

  /** The playhead in integer microseconds. */
  get timeUs(): number {
    if (this.#phase !== "playing") return this.#pausedUs;
    const elapsedS = Math.max(0, this.#options.clock.audibleTime() - this.#origin.contextTime);
    return Math.min(
      this.#options.durationUs,
      this.#origin.timelineUs + Math.round(elapsedS * 1_000_000),
    );
  }

  /** Called whenever `playing` or the playhead jumps (play, pause, seek, end). */
  onChange(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async play(): Promise<void> {
    if (this.#wantsPlaying) return;
    this.#wantsPlaying = true;
    if (this.#pausedUs >= this.#options.durationUs) this.#pausedUs = 0;
    this.#emit(); // the play button should react at once; sound follows once it is ready
    await this.#startAudio(this.#pausedUs, ++this.#epoch);
  }

  pause(): void {
    const at = this.timeUs;
    this.#epoch += 1;
    this.#wantsPlaying = false;
    this.#cancelTick();
    this.#phase = "stopped";
    this.#pausedUs = at;
    void this.#options.audio.stop();
    this.#options.frames.requestFrame(this.#options.compositionId, at);
    this.#emit();
  }

  async seek(us: number): Promise<void> {
    const target = Math.min(this.#options.durationUs, Math.max(0, Math.round(us)));
    const epoch = ++this.#epoch;
    this.#cancelTick();
    this.#phase = "starting"; // hold the playhead still while we move
    this.#pausedUs = target;
    await this.#options.audio.stop();
    await this.#options.frames.renderNow(this.#options.compositionId, target);
    if (epoch !== this.#epoch) return; // a newer seek or pause took over
    if (this.#wantsPlaying) await this.#startAudio(target, epoch);
    else this.#phase = "stopped";
    this.#emit();
  }

  dispose(): void {
    this.pause();
    this.#listeners.clear();
  }

  async #startAudio(fromUs: number, epoch: number): Promise<void> {
    this.#phase = "starting";
    this.#pausedUs = fromUs;
    const contextStart =
      this.#options.clock.currentTime() + (this.#options.startLeadS ?? DEFAULT_LEAD_S);
    await this.#options.audio.start(this.#options.compositionId, fromUs, contextStart);
    if (epoch !== this.#epoch) return; // paused or sought while the audio was spinning up
    this.#origin = { timelineUs: fromUs, contextTime: contextStart };
    this.#phase = "playing";
    this.#emit();
    this.#scheduleTick();
  }

  #scheduleTick(): void {
    this.#raf = this.#timers.requestFrame(() => {
      this.#tick();
    });
  }

  #cancelTick(): void {
    if (this.#raf !== null) this.#timers.cancelFrame(this.#raf);
    this.#raf = null;
  }

  #tick(): void {
    this.#raf = null;
    if (this.#phase !== "playing") return;
    const t = this.timeUs;
    const { compositionId, durationUs, frames, audio } = this.#options;
    frames.requestFrame(compositionId, t);
    void audio.scheduleUntil(t + (this.#options.lookaheadUs ?? DEFAULT_LOOKAHEAD_US));
    if (t >= durationUs) {
      this.pause(); // end of the timeline
      return;
    }
    this.#scheduleTick();
  }

  #emit(): void {
    for (const listener of this.#listeners) listener();
  }
}
