/**
 * Changes the speed of audio without changing its pitch: a streaming WSOLA (waveform-similarity
 * overlap-add) time-stretcher. Frames of ~40 ms are taken from the input at `speed` × the output
 * hop and overlap-added with a Hann window; each frame is shifted (within ±12 ms) to where it best
 * matches the continuation of the previous one, so periodic sounds don't phase-cancel. The match
 * uses the sum of all channels, so stereo stays coherent. Entirely deterministic.
 *
 * Feed input with `push` in any chunk sizes; it returns whatever output is final so far. `flush`
 * returns the rest. The output length is `round(inputLength / speed)` (± one frame of rounding,
 * which `flush` trims or pads).
 */
export class TimeStretcher {
  readonly channels: number;
  readonly speed: number;
  readonly #frame: number;
  readonly #hopOut: number;
  readonly #hopIn: number;
  readonly #tolerance: number;
  readonly #window: Float32Array;
  /** Input not yet consumed, per channel; `#inBase` is the absolute index of its first sample. */
  #input: Float32Array[];
  #inBase = 0;
  #inLength = 0;
  /** Output being overlap-added; `#outBase` is the absolute index of its first sample. */
  #output: Float32Array[];
  #outBase = 0;
  /** Absolute input index where the previous frame was taken (-1 before the first). */
  #previous = -1;
  #frameIndex = 0;
  #totalIn = 0;
  #totalOut = 0;

  constructor(channels: number, sampleRate: number, speed: number) {
    if (!(speed > 0)) throw new RangeError("speed must be positive");
    this.channels = Math.max(1, channels);
    this.speed = speed;
    this.#frame = 2 * Math.round((sampleRate * 0.04) / 2);
    this.#hopOut = this.#frame / 2;
    this.#hopIn = this.#hopOut * speed;
    this.#tolerance = Math.round(sampleRate * 0.012);
    this.#window = new Float32Array(this.#frame);
    for (let i = 0; i < this.#frame; i += 1) {
      this.#window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / this.#frame);
    }
    this.#input = Array.from({ length: this.channels }, () => new Float32Array(0));
    this.#output = Array.from({ length: this.channels }, () => new Float32Array(this.#frame * 2));
  }

  /** Adds input; returns the output that is complete so far (may be empty). */
  push(input: readonly Float32Array[]): Float32Array[] {
    const n = input[0]?.length ?? 0;
    if (n > 0) {
      this.#input = this.#input.map((buf, c) => {
        const next = new Float32Array(this.#inLength + n);
        next.set(buf.subarray(0, this.#inLength));
        next.set(input[c] ?? input[0] ?? new Float32Array(n), this.#inLength);
        return next;
      });
      this.#inLength += n;
      this.#totalIn += n;
    }
    return this.#run(false);
  }

  /** Ends the stream: processes what is left (padding with silence) and returns the tail. */
  flush(): Float32Array[] {
    const out = this.#run(true);
    const expected = Math.round(this.#totalIn / this.speed);
    const have = this.#totalOut;
    if (have > expected) {
      const cut = have - expected;
      return out.map((ch) => ch.subarray(0, Math.max(0, ch.length - cut)));
    }
    if (have < expected) {
      const pad = expected - have;
      return out.map((ch) => {
        const longer = new Float32Array(ch.length + pad);
        longer.set(ch);
        return longer;
      });
    }
    return out;
  }

  #sample(c: number, absolute: number): number {
    const i = absolute - this.#inBase;
    if (i < 0 || i >= this.#inLength) return 0;
    return this.#input[c]?.[i] ?? 0;
  }

  #mono(absolute: number): number {
    let sum = 0;
    for (let c = 0; c < this.channels; c += 1) sum += this.#sample(c, absolute);
    return sum;
  }

  /** How well a frame starting at `candidate` continues the previous frame (higher is better). */
  #similarity(candidate: number, natural: number, step: number): number {
    let dot = 0;
    let energy = 1e-9;
    const overlap = this.#hopOut;
    for (let i = 0; i < overlap; i += step) {
      const a = this.#mono(candidate + i);
      dot += a * this.#mono(natural + i);
      energy += a * a;
    }
    return dot / Math.sqrt(energy);
  }

  #bestOffset(nominal: number): number {
    if (this.#previous < 0) return nominal;
    const natural = this.#previous + this.#hopOut;
    const lo = Math.max(this.#inBase, nominal - this.#tolerance);
    const hi = nominal + this.#tolerance;
    // Coarse search on every 4th sample and every 2nd lag, then refine around the best lag.
    let best = Math.max(lo, Math.min(hi, nominal));
    let bestScore = -Infinity;
    for (let lag = lo; lag <= hi; lag += 2) {
      const score = this.#similarity(lag, natural, 4);
      if (score > bestScore) {
        bestScore = score;
        best = lag;
      }
    }
    const coarse = best;
    bestScore = -Infinity;
    for (let lag = Math.max(lo, coarse - 2); lag <= Math.min(hi, coarse + 2); lag += 1) {
      const score = this.#similarity(lag, natural, 1);
      if (score > bestScore) {
        bestScore = score;
        best = lag;
      }
    }
    return best;
  }

  #run(final: boolean): Float32Array[] {
    const end = this.#inBase + this.#inLength;
    for (;;) {
      const nominal = Math.round(this.#frameIndex * this.#hopIn);
      const needs = nominal + this.#tolerance + this.#frame + this.#hopOut;
      if (!final && needs > end) break;
      if (final && nominal >= end) break;
      const from = this.#bestOffset(nominal);
      const outAt = this.#frameIndex * this.#hopOut - this.#outBase;
      this.#ensureOutput(outAt + this.#frame);
      for (let c = 0; c < this.channels; c += 1) {
        const out = this.#output[c];
        if (out === undefined) continue;
        // The very first frame has nothing before it to overlap: no fade-in on its first half.
        const first = this.#frameIndex === 0;
        for (let i = 0; i < this.#frame; i += 1) {
          const w = first && i < this.#hopOut ? 1 : (this.#window[i] ?? 0);
          out[outAt + i] = (out[outAt + i] ?? 0) + this.#sample(c, from + i) * w;
        }
      }
      this.#previous = from;
      this.#frameIndex += 1;
      this.#trimInput();
    }
    // Everything before the start of the next frame is complete.
    const ready = final
      ? this.#frameIndex * this.#hopOut + this.#hopOut - this.#outBase
      : this.#frameIndex * this.#hopOut - this.#outBase;
    return this.#take(Math.max(0, ready));
  }

  #ensureOutput(length: number): void {
    const have = this.#output[0]?.length ?? 0;
    if (length <= have) return;
    this.#output = this.#output.map((buf) => {
      const next = new Float32Array(Math.max(length, have * 2));
      next.set(buf);
      return next;
    });
  }

  #take(count: number): Float32Array[] {
    const n = Math.min(count, this.#output[0]?.length ?? 0);
    const done = this.#output.map((buf) => buf.slice(0, n));
    this.#output = this.#output.map((buf) => {
      const rest = new Float32Array(Math.max(buf.length - n, this.#frame * 2));
      rest.set(buf.subarray(n));
      return rest;
    });
    this.#outBase += n;
    this.#totalOut += n;
    return done;
  }

  /** Drops input no later frame can reach. */
  #trimInput(): void {
    const nominal = Math.round(this.#frameIndex * this.#hopIn);
    const keepFrom = Math.min(nominal - this.#tolerance, this.#previous + this.#hopOut) - 1;
    const drop = Math.max(0, Math.min(this.#inLength, keepFrom - this.#inBase));
    if (drop < 4096) return;
    this.#input = this.#input.map((buf) => buf.slice(drop, this.#inLength));
    this.#inBase += drop;
    this.#inLength -= drop;
  }
}
