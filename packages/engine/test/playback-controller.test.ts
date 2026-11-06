import { describe, expect, it } from "vitest";
import {
  FrameScheduler,
  PlaybackController,
  audioContextClock,
  type AudioPort,
  type ClockSource,
  type FramePort,
  type Timers,
} from "../src/index.ts";

class FakeClock implements ClockSource {
  now = 10; // context time being scheduled
  audible = 10; // context time being heard
  currentTime = () => this.now;
  audibleTime = () => this.audible;
  advance(seconds: number): void {
    this.now += seconds;
    this.audible += seconds;
  }
}

class FakeTimers implements Timers {
  readonly callbacks = new Map<number, () => void>();
  #next = 1;
  requestFrame(callback: () => void): number {
    const id = this.#next++;
    this.callbacks.set(id, callback);
    return id;
  }
  cancelFrame(handle: number): void {
    this.callbacks.delete(handle);
  }
  /** Runs the one pending animation-frame callback, if any. */
  tick(): boolean {
    const [first] = this.callbacks;
    if (first === undefined) return false;
    this.callbacks.delete(first[0]);
    first[1]();
    return true;
  }
}

class FakeFrames implements FramePort {
  readonly requested: number[] = [];
  readonly rendered: number[] = [];
  gate: Promise<void> | null = null;
  requestFrame(_comp: string, tUs: number): void {
    this.requested.push(tUs);
  }
  async renderNow(_comp: string, tUs: number): Promise<void> {
    if (this.gate !== null) await this.gate;
    this.rendered.push(tUs);
  }
}

class FakeAudio implements AudioPort {
  readonly events: string[] = [];
  readonly scheduled: number[] = [];
  gate: Promise<void> | null = null;
  async start(_comp: string, fromUs: number, contextStart: number): Promise<void> {
    this.events.push(`start ${String(fromUs)} @${contextStart.toFixed(2)}`);
    if (this.gate !== null) await this.gate;
  }
  scheduleUntil(untilUs: number): Promise<void> {
    this.scheduled.push(untilUs);
    return Promise.resolve();
  }
  stop(): Promise<void> {
    this.events.push("stop");
    return Promise.resolve();
  }
}

function setup(durationUs = 10_000_000) {
  const clock = new FakeClock();
  const timers = new FakeTimers();
  const frames = new FakeFrames();
  const audio = new FakeAudio();
  const controller = new PlaybackController({
    compositionId: "main",
    durationUs,
    frames,
    audio,
    clock,
    timers,
    startLeadS: 0.08,
    lookaheadUs: 1_000_000,
  });
  return { clock, timers, frames, audio, controller };
}

describe("PlaybackController", () => {
  it("follows the audio clock: the playhead is frozen until sound starts, then tracks it", async () => {
    const { clock, controller, audio } = setup();
    await controller.play();
    expect(controller.playing).toBe(true);
    expect(audio.events).toEqual(["start 0 @10.08"]);
    expect(controller.timeUs).toBe(0);
    clock.advance(0.05); // still inside the start lead
    expect(controller.timeUs).toBe(0);
    clock.advance(1.58); // audible time is now 11.63: 1.55 s after the first sound
    expect(controller.timeUs).toBe(1_550_000);
  });

  it("each animation frame asks for the picture at the clock time and keeps audio scheduled ahead", async () => {
    const { clock, controller, timers, frames, audio } = setup();
    await controller.play();
    clock.advance(0.58); // 0.5 s of sound
    timers.tick();
    clock.advance(0.0167);
    timers.tick();
    expect(frames.requested).toEqual([500_000, 516_700]);
    expect(audio.scheduled).toEqual([1_500_000, 1_516_700]);
  });

  it("pause freezes the playhead, stops audio and shows the paused frame", async () => {
    const { clock, controller, frames, audio, timers } = setup();
    await controller.play();
    clock.advance(1.08);
    controller.pause();
    expect(controller.playing).toBe(false);
    expect(controller.timeUs).toBe(1_000_000);
    expect(audio.events.at(-1)).toBe("stop");
    expect(frames.requested.at(-1)).toBe(1_000_000);
    clock.advance(5);
    expect(controller.timeUs).toBe(1_000_000);
    expect(timers.tick()).toBe(false); // no more animation frames
  });

  it("resumes from where it paused", async () => {
    const { clock, controller, audio } = setup();
    await controller.play();
    clock.advance(2.08);
    controller.pause();
    await controller.play();
    expect(audio.events.at(-1)).toMatch(/^start 2000000 @/);
  });

  it("seeks while stopped without starting audio", async () => {
    const { controller, frames, audio } = setup();
    await controller.seek(3_250_000);
    expect(controller.timeUs).toBe(3_250_000);
    expect(frames.rendered).toEqual([3_250_000]);
    expect(audio.events).toEqual(["stop"]);
    expect(controller.playing).toBe(false);
  });

  it("seeks while playing: stops audio, shows the frame, then restarts sound at the new place", async () => {
    const { clock, controller, frames, audio } = setup();
    await controller.play();
    clock.advance(1.08);
    await controller.seek(6_000_000);
    expect(audio.events).toEqual([
      "start 0 @10.08",
      "stop",
      `start 6000000 @${(11.08 + 0.08).toFixed(2)}`,
    ]);
    expect(frames.rendered).toEqual([6_000_000]);
    expect(controller.playing).toBe(true);
    clock.advance(0.58);
    expect(controller.timeUs).toBe(6_500_000);
  });

  it("doesn't request frames at the old position while a seek is in progress", async () => {
    const { clock, controller, frames, timers } = setup();
    await controller.play();
    clock.advance(1.08);
    let release!: () => void;
    frames.gate = new Promise((resolve) => {
      release = resolve;
    });
    const seeking = controller.seek(4_000_000);
    expect(timers.tick()).toBe(false); // the animation loop is suspended
    expect(frames.requested).toEqual([]);
    release();
    await seeking;
  });

  it("lets the last of several rapid seeks win and starts audio only once", async () => {
    const { clock, controller, frames, audio } = setup();
    await controller.play();
    audio.events.length = 0;
    const releases: (() => void)[] = [];
    frames.gate = new Promise((resolve) => releases.push(resolve));
    const first = controller.seek(2_000_000);
    const second = controller.seek(8_000_000);
    releases.forEach((release) => {
      release();
    });
    await Promise.all([first, second]);
    expect(audio.events.filter((e) => e.startsWith("start"))).toHaveLength(1);
    expect(audio.events.find((e) => e.startsWith("start"))).toMatch(/^start 8000000 @/);
    expect(controller.playing).toBe(true);
    clock.advance(0.58); // 0.5 s of sound after the (single) restart
    expect(controller.timeUs).toBe(8_500_000);
  });

  it("does not start playing if paused while the audio is still spinning up", async () => {
    const { controller, audio, timers } = setup();
    let release!: () => void;
    audio.gate = new Promise((resolve) => {
      release = resolve;
    });
    const starting = controller.play();
    controller.pause();
    release();
    await starting;
    expect(controller.playing).toBe(false);
    expect(timers.tick()).toBe(false);
    expect(audio.events.at(-1)).toBe("stop");
  });

  it("stops at the end of the timeline, and playing again starts over", async () => {
    const { clock, controller, timers, audio } = setup(2_000_000);
    await controller.play();
    clock.advance(2.5);
    timers.tick();
    expect(controller.playing).toBe(false);
    expect(controller.timeUs).toBe(2_000_000);
    await controller.play();
    expect(audio.events.at(-1)).toMatch(/^start 0 @/);
  });

  it("clamps seeks into the timeline and keeps time in whole microseconds", async () => {
    const { controller } = setup(5_000_000);
    await controller.seek(-100);
    expect(controller.timeUs).toBe(0);
    await controller.seek(9_000_000);
    expect(controller.timeUs).toBe(5_000_000);
    await controller.seek(1_234_567.8);
    expect(controller.timeUs).toBe(1_234_568);
  });

  it("tells listeners about play, pause and seek", async () => {
    const { controller } = setup();
    let changes = 0;
    const off = controller.onChange(() => {
      changes += 1;
    });
    await controller.play();
    controller.pause();
    await controller.seek(1_000_000);
    expect(changes).toBe(4); // play (button reacts), play (sound started), pause, seek
    off();
    controller.pause();
    expect(changes).toBe(4);
  });
});

describe("audioContextClock", () => {
  const fake = (
    over: Partial<{
      contextTime: number;
      currentTime: number;
      outputLatency: number;
      baseLatency: number;
    }>,
  ) =>
    ({
      currentTime: over.currentTime ?? 4,
      outputLatency: over.outputLatency ?? 0,
      baseLatency: over.baseLatency ?? 0.01,
      getOutputTimestamp: () => ({ contextTime: over.contextTime }),
    }) as unknown as AudioContext;

  it("uses the audible output position when the browser reports it", () => {
    expect(audioContextClock(fake({ contextTime: 3.832 })).audibleTime()).toBe(3.832);
  });

  it("falls back to currentTime minus the output latency otherwise, never below zero", () => {
    expect(
      audioContextClock(fake({ contextTime: 0, outputLatency: 0.2 })).audibleTime(),
    ).toBeCloseTo(3.8);
    expect(
      audioContextClock(fake({ contextTime: undefined, outputLatency: 0 })).audibleTime(),
    ).toBeCloseTo(3.99);
    expect(audioContextClock(fake({ currentTime: 0.001, outputLatency: 0.5 })).audibleTime()).toBe(
      0,
    );
    expect(audioContextClock(fake({})).currentTime()).toBe(4);
  });
});

describe("FrameScheduler", () => {
  function setup() {
    const rendered: number[] = [];
    const presented: number[] = [];
    const errors: string[] = [];
    let release: (() => void) | null = null;
    const scheduler = new FrameScheduler<number>(
      async (request) => {
        if (request.tUs === 0) await new Promise<void>((resolve) => (release = resolve)); // a slow frame
        if (request.tUs === -1) throw new Error("decoder exploded");
        rendered.push(request.tUs);
        return request.tUs * 2;
      },
      (_request, result) => presented.push(result),
      (request, error) => errors.push(`${String(request.tUs)}: ${String(error)}`),
    );
    return {
      scheduler,
      rendered,
      presented,
      errors,
      finish: () => release?.(),
    };
  }

  it("renders only the newest request when frames arrive faster than they render", async () => {
    const { scheduler, rendered, finish } = setup();
    scheduler.request({ compositionId: "m", tUs: 0 }); // starts and blocks
    for (const t of [10, 20, 30]) scheduler.request({ compositionId: "m", tUs: t });
    finish();
    await scheduler.flush();
    expect(rendered).toEqual([0, 30]);
    expect(scheduler.stats).toEqual({ requested: 4, rendered: 2, dropped: 2 });
  });

  it("reports presented frames and errors, and keeps going after an error", async () => {
    const { scheduler, presented, errors } = setup();
    scheduler.request({ compositionId: "m", tUs: -1 });
    await scheduler.flush();
    scheduler.request({ compositionId: "m", tUs: 5 });
    await scheduler.flush();
    expect(errors).toEqual(["-1: Error: decoder exploded"]);
    expect(presented).toEqual([10]);
  });

  it("flush resolves immediately when idle", async () => {
    await setup().scheduler.flush();
  });
});
