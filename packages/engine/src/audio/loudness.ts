/**
 * Loudness as ITU-R BS.1770-4 / EBU R 128 define it: K-weighting, mean square over 400 ms blocks
 * (75% overlap), an absolute gate at −70 LUFS and a relative gate 10 LU below the absolute-gated
 * level; plus momentary (400 ms) and short-term (3 s) loudness and the true peak (4× oversampled).
 * Pure functions over samples: used to normalise exports and to show exact numbers.
 */

/** Biquad coefficients, a[0] = 1. */
export interface Biquad {
  b: [number, number, number];
  a: [number, number, number];
}

/** The two K-weighting stages (a high shelf, then a high pass) for a sample rate. */
export function kWeighting(sampleRate: number): [Biquad, Biquad] {
  // Same derivation as libebur128, valid at any sample rate.
  let f0 = 1681.974450955533;
  const gain = 3.999843853973347;
  let q = 0.7071752369554196;
  let k = Math.tan((Math.PI * f0) / sampleRate);
  const vh = 10 ** (gain / 20);
  const vb = vh ** 0.4996667741545416;
  let a0 = 1 + k / q + k * k;
  const shelf: Biquad = {
    b: [
      (vh + (vb * k) / q + k * k) / a0,
      (2 * (k * k - vh)) / a0,
      (vh - (vb * k) / q + k * k) / a0,
    ],
    a: [1, (2 * (k * k - 1)) / a0, (1 - k / q + k * k) / a0],
  };
  f0 = 38.13547087602444;
  q = 0.5003270373238773;
  k = Math.tan((Math.PI * f0) / sampleRate);
  a0 = 1 + k / q + k * k;
  const highpass: Biquad = {
    b: [1, -2, 1],
    a: [1, (2 * (k * k - 1)) / a0, (1 - k / q + k * k) / a0],
  };
  return [shelf, highpass];
}

/** Runs samples through biquads (direct form I), returning a new array. */
export function filter(samples: Float32Array, stages: readonly Biquad[]): Float32Array {
  let current = samples;
  for (const { b, a } of stages) {
    const out = new Float32Array(current.length);
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < current.length; i += 1) {
      const x = current[i] ?? 0;
      const y = b[0] * x + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
      out[i] = y;
      x2 = x1;
      x1 = x;
      y2 = y1;
      y1 = y;
    }
    current = out;
  }
  return current;
}

const LOG = (energy: number): number =>
  energy <= 0 ? Number.NEGATIVE_INFINITY : -0.691 + 10 * Math.log10(energy);

export interface LoudnessReport {
  /** Gated programme loudness, LUFS (−∞ for silence). */
  integrated: number;
  /** Loudest 400 ms and 3 s windows, LUFS. */
  momentaryMax: number;
  shortTermMax: number;
  /** Highest true (inter-sample) peak, dBTP, and sample peak, dBFS. */
  truePeak: number;
  samplePeak: number;
}

/**
 * Energy (weighted mean square summed over channels) of each 100 ms piece of the K-weighted
 * signal. Blocks and windows are built from these, so momentary, short-term and gating agree.
 */
export function subBlockEnergies(channels: readonly Float32Array[], sampleRate: number): number[] {
  const stages = kWeighting(sampleRate);
  const weighted = channels.map((ch) => filter(ch, stages));
  const step = Math.round(sampleRate / 10);
  const n = weighted[0]?.length ?? 0;
  const energies: number[] = [];
  for (let start = 0; start + step <= n; start += step) {
    let sum = 0;
    for (const ch of weighted) {
      let s = 0;
      for (let i = start; i < start + step; i += 1) {
        const v = ch[i] ?? 0;
        s += v * v;
      }
      sum += s / step; // mono, stereo and centre channels all weigh 1
    }
    energies.push(sum);
  }
  return energies;
}

/** Mean energy over a window of `size` sub-blocks ending at `end` (exclusive). */
function windowEnergy(energies: readonly number[], end: number, size: number): number {
  let sum = 0;
  for (let i = end - size; i < end; i += 1) sum += energies[i] ?? 0;
  return sum / size;
}

/** Integrated loudness from 100 ms sub-block energies (400 ms blocks, 75% overlap, both gates). */
export function integratedFrom(energies: readonly number[]): number {
  const blocks: number[] = [];
  for (let end = 4; end <= energies.length; end += 1) blocks.push(windowEnergy(energies, end, 4));
  const absolute = blocks.filter((z) => LOG(z) > -70);
  if (absolute.length === 0) return Number.NEGATIVE_INFINITY;
  const mean = absolute.reduce((s, z) => s + z, 0) / absolute.length;
  const relative = LOG(mean) - 10;
  const gated = absolute.filter((z) => LOG(z) > relative);
  if (gated.length === 0) return Number.NEGATIVE_INFINITY;
  return LOG(gated.reduce((s, z) => s + z, 0) / gated.length);
}

/** Interpolation filter for 4× oversampling (48 taps, Hann-windowed sinc, cut-off at the old Nyquist). */
const OVERSAMPLE = 4;
const TAPS_PER_PHASE = 12;
const PHASES: Float32Array[] = (() => {
  const taps = OVERSAMPLE * TAPS_PER_PHASE;
  const h = new Float32Array(taps);
  const centre = (taps - 1) / 2;
  for (let i = 0; i < taps; i += 1) {
    const x = (i - centre) / OVERSAMPLE;
    const sinc = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i + 0.5)) / taps);
    h[i] = sinc * w;
  }
  return Array.from({ length: OVERSAMPLE }, (_, p) => {
    const phase = new Float32Array(TAPS_PER_PHASE);
    for (let t = 0; t < TAPS_PER_PHASE; t += 1) phase[t] = h[t * OVERSAMPLE + p] ?? 0;
    return phase;
  });
})();

/**
 * Highest absolute value of the signal oversampled 4× (linear). Inter-sample peaks overshoot the
 * samples around them by a few dB at most, so only stretches within 8 dB of the sample peak are
 * oversampled (the result is the same; a long programme takes a fraction of the time).
 */
export function truePeakOf(channels: readonly Float32Array[]): number {
  let samplePeak = 0;
  for (const ch of channels) for (const v of ch) samplePeak = Math.max(samplePeak, Math.abs(v));
  const worth = samplePeak / 2.5;
  let peak = samplePeak;
  const half = TAPS_PER_PHASE / 2;
  for (const ch of channels) {
    for (let i = 0; i < ch.length; i += 1) {
      if (Math.abs(ch[i] ?? 0) < worth && Math.abs(ch[i + 1] ?? 0) < worth) continue;
      for (const phase of PHASES) {
        let v = 0;
        for (let t = 0; t < TAPS_PER_PHASE; t += 1) v += (phase[t] ?? 0) * (ch[i - t + half] ?? 0);
        peak = Math.max(peak, Math.abs(v));
      }
    }
  }
  return peak;
}

const toDb = (linear: number): number =>
  linear <= 0 ? Number.NEGATIVE_INFINITY : 20 * Math.log10(linear);

/** Everything about a programme's loudness. */
export function measureLoudness(
  channels: readonly Float32Array[],
  sampleRate: number,
): LoudnessReport {
  const energies = subBlockEnergies(channels, sampleRate);
  let momentaryMax = Number.NEGATIVE_INFINITY;
  let shortTermMax = Number.NEGATIVE_INFINITY;
  for (let end = 4; end <= energies.length; end += 1) {
    momentaryMax = Math.max(momentaryMax, LOG(windowEnergy(energies, end, 4)));
    if (end >= 30) shortTermMax = Math.max(shortTermMax, LOG(windowEnergy(energies, end, 30)));
  }
  let samplePeak = 0;
  for (const ch of channels) for (const v of ch) samplePeak = Math.max(samplePeak, Math.abs(v));
  return {
    integrated: integratedFrom(energies),
    momentaryMax,
    shortTermMax,
    truePeak: toDb(truePeakOf(channels)),
    samplePeak: toDb(samplePeak),
  };
}

/**
 * Running loudness for live meters: give it the energy of each successive 100 ms piece of the
 * K-weighted mix; it keeps momentary (last 400 ms), short-term (last 3 s) and integrated values.
 */
export class LoudnessAccumulator {
  #energies: number[] = [];

  add(energy: number): void {
    this.#energies.push(energy);
    // Ten hours of 100 ms pieces is plenty for one listening session.
    if (this.#energies.length > 360_000) this.#energies.splice(0, 36_000);
  }

  reset(): void {
    this.#energies = [];
  }

  get momentary(): number {
    const n = this.#energies.length;
    return n < 4 ? Number.NEGATIVE_INFINITY : LOG(windowEnergy(this.#energies, n, 4));
  }

  get shortTerm(): number {
    const n = this.#energies.length;
    return n < 30
      ? n < 4
        ? Number.NEGATIVE_INFINITY
        : LOG(windowEnergy(this.#energies, n, n))
      : LOG(windowEnergy(this.#energies, n, 30));
  }

  get integrated(): number {
    return integratedFrom(this.#energies);
  }
}
