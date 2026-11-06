export interface FrameRequest {
  compositionId: string;
  tUs: number;
}

export interface SchedulerStats {
  requested: number;
  rendered: number;
  /** Requests replaced by a newer one before they were rendered. */
  dropped: number;
}

/**
 * Renders at most one frame at a time and always the newest request: while a render is in flight,
 * newer requests replace older ones (older ones count as dropped). That is what keeps playback
 * on the clock when a frame takes longer than its slot.
 */
export class FrameScheduler<R> {
  readonly stats: SchedulerStats = { requested: 0, rendered: 0, dropped: 0 };
  readonly #render: (request: FrameRequest) => Promise<R>;
  readonly #onPresented: (request: FrameRequest, result: R) => void;
  readonly #onError: (request: FrameRequest, error: unknown) => void;
  #pending: FrameRequest | null = null;
  #running = false;
  #idle: (() => void)[] = [];

  constructor(
    render: (request: FrameRequest) => Promise<R>,
    onPresented: (request: FrameRequest, result: R) => void,
    onError: (request: FrameRequest, error: unknown) => void,
  ) {
    this.#render = render;
    this.#onPresented = onPresented;
    this.#onError = onError;
  }

  request(request: FrameRequest): void {
    this.stats.requested += 1;
    if (this.#pending !== null) this.stats.dropped += 1;
    this.#pending = request;
    if (!this.#running) void this.#run();
  }

  /**
   * Forgets a request that hasn't started rendering (it counts as dropped). A seek calls this so
   * that a stale playback frame can't be drawn after the seek's own frame.
   */
  cancelPending(): boolean {
    if (this.#pending === null) return false;
    this.#pending = null;
    this.stats.dropped += 1;
    return true;
  }

  /** Resolves once nothing is pending or rendering. */
  flush(): Promise<void> {
    if (!this.#running && this.#pending === null) return Promise.resolve();
    return new Promise((resolve) => {
      this.#idle.push(resolve);
    });
  }

  async #run(): Promise<void> {
    this.#running = true;
    try {
      while (this.#pending !== null) {
        const request = this.#pending;
        this.#pending = null;
        try {
          const result = await this.#render(request);
          this.stats.rendered += 1;
          this.#onPresented(request, result);
        } catch (error) {
          this.#onError(request, error);
        }
      }
    } finally {
      this.#running = false;
      const waiting = this.#idle;
      this.#idle = [];
      for (const resolve of waiting) resolve();
    }
  }
}
