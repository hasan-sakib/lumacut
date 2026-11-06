/** The audio clock: the single source of time while playing. */
export interface ClockSource {
  /** Context time (s) of the audio being scheduled now. */
  currentTime(): number;
  /** Context time (s) of the audio you can hear right now (accounts for output latency). */
  audibleTime(): number;
}

/**
 * Wraps a Web Audio context. `getOutputTimestamp().contextTime` is the position of the sound
 * leaving the speakers, which lags `currentTime` by the output latency: the picture follows what
 * is heard, not what is queued.
 */
export function audioContextClock(context: AudioContext): ClockSource {
  return {
    currentTime: () => context.currentTime,
    audibleTime: () => {
      const stamp = context.getOutputTimestamp();
      if (typeof stamp.contextTime === "number" && stamp.contextTime > 0) return stamp.contextTime;
      const latency = context.outputLatency > 0 ? context.outputLatency : context.baseLatency;
      return Math.max(0, context.currentTime - latency);
    },
  };
}

/** The AudioContext every playback session should use: 48 kHz matches the proxies, so no resampling. */
export function createPlaybackContext(): AudioContext {
  return new AudioContext({ sampleRate: 48000, latencyHint: "interactive" });
}
