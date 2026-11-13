export interface GateSettings {
  /** Below this level (dBFS) the gate closes. */
  thresholdDb: number;
  attackMs: number;
  holdMs: number;
  releaseMs: number;
  /** How far the gate turns the sound down when closed (dB, negative; −80 ≈ silence). */
  rangeDb: number;
}

const dbToGain = (db: number): number => 10 ** (db / 20);

/**
 * A noise gate that runs on samples as they are decoded (streaming: state carries across calls).
 * The level is a peak envelope of all channels; the gate opens above the threshold, closes 3 dB
 * below it (so it doesn't chatter), stays open for `hold`, and fades between open and closed with
 * the attack and release times. Deterministic.
 */
export class NoiseGate {
  readonly #open: number;
  readonly #close: number;
  readonly #floor: number;
  readonly #attack: number;
  readonly #release: number;
  readonly #envRelease: number;
  readonly #holdSamples: number;
  #envelope = 0;
  #gain = 1;
  #holding = 0;
  #isOpen = true;

  constructor(sampleRate: number, settings: GateSettings) {
    this.#open = dbToGain(settings.thresholdDb);
    this.#close = dbToGain(settings.thresholdDb - 3);
    this.#floor = dbToGain(Math.min(0, settings.rangeDb));
    const coefficient = (ms: number) => Math.exp(-1 / Math.max(1, (ms / 1000) * sampleRate));
    this.#attack = coefficient(Math.max(0.1, settings.attackMs));
    this.#release = coefficient(Math.max(1, settings.releaseMs));
    this.#envRelease = coefficient(20);
    this.#holdSamples = Math.round((Math.max(0, settings.holdMs) / 1000) * sampleRate);
  }

  /** Gates the channels in place. */
  process(channels: Float32Array[]): void {
    const n = channels[0]?.length ?? 0;
    for (let i = 0; i < n; i += 1) {
      let peak = 0;
      for (const ch of channels) peak = Math.max(peak, Math.abs(ch[i] ?? 0));
      this.#envelope = peak > this.#envelope ? peak : this.#envelope * this.#envRelease;
      if (this.#envelope >= this.#open) {
        this.#isOpen = true;
        this.#holding = this.#holdSamples;
      } else if (this.#envelope < this.#close) {
        if (this.#holding > 0) this.#holding -= 1;
        else this.#isOpen = false;
      }
      const target = this.#isOpen ? 1 : this.#floor;
      const k = target > this.#gain ? this.#attack : this.#release;
      this.#gain = target + (this.#gain - target) * k;
      for (const ch of channels) ch[i] = (ch[i] ?? 0) * this.#gain;
    }
  }
}
