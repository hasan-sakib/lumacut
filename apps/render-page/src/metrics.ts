/** Pure measurement helpers for the playback benchmark (unit-tested in Node). */

export interface Distribution {
  mean: number;
  p50: number;
  p95: number;
  max: number;
}

export function distribution(values: readonly number[]): Distribution {
  if (values.length === 0) return { mean: 0, p50: 0, p95: 0, max: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
  const sum = sorted.reduce((total, v) => total + v, 0);
  return { mean: sum / sorted.length, p50: at(0.5), p95: at(0.95), max: sorted.at(-1) ?? 0 };
}

export interface PresentedFrame {
  /** performance.now() when the page learned the frame was presented. */
  wallMs: number;
  tUs: number;
  renderMs: number;
  /** Audio clock minus the frame's time (µs) while playing. */
  offsetUs: number | null;
}

export interface FrameCoverage {
  /** Distinct composition frames shown. */
  shown: number;
  /** Frames between the first and last shown, inclusive: what a viewer should have seen. */
  expected: number;
  /** Fraction of expected frames never shown, 0..1. */
  droppedFraction: number;
}

/** Which composition frames reached the screen, whatever the display refresh rate. */
export function frameCoverage(
  tUsList: readonly number[],
  fps: { num: number; den: number },
): FrameCoverage {
  if (tUsList.length === 0) return { shown: 0, expected: 0, droppedFraction: 0 };
  const index = (tUs: number) => Math.floor((tUs * fps.num) / (1_000_000 * fps.den));
  const frames = new Set(tUsList.map(index));
  const indexes = [...frames];
  const first = Math.min(...indexes);
  const last = Math.max(...indexes);
  const expected = last - first + 1;
  return { shown: frames.size, expected, droppedFraction: 1 - frames.size / expected };
}

export interface PlaybackReport {
  frames: number;
  presentedFps: number;
  renderMs: Distribution;
  coverage: FrameCoverage;
  /** Longest gap between two presented frames. */
  longestGapMs: number;
  offsetMsAbs: Distribution;
}

/** Summarises the frames presented after the warm-up period. */
export function summarize(
  frames: readonly PresentedFrame[],
  warmupMs: number,
  fps: { num: number; den: number },
): PlaybackReport {
  const start = frames[0]?.wallMs ?? 0;
  const steady = frames.filter((f) => f.wallMs - start >= warmupMs);
  const span = steady.length > 1 ? (steady.at(-1)?.wallMs ?? 0) - (steady[0]?.wallMs ?? 0) : 0;
  let longestGapMs = 0;
  for (let i = 1; i < steady.length; i += 1) {
    longestGapMs = Math.max(longestGapMs, (steady[i]?.wallMs ?? 0) - (steady[i - 1]?.wallMs ?? 0));
  }
  return {
    frames: steady.length,
    presentedFps: span > 0 ? ((steady.length - 1) * 1000) / span : 0,
    renderMs: distribution(steady.map((f) => f.renderMs)),
    coverage: frameCoverage(
      steady.map((f) => f.tUs),
      fps,
    ),
    longestGapMs,
    offsetMsAbs: distribution(
      steady.flatMap((f) => (f.offsetUs === null ? [] : [Math.abs(f.offsetUs) / 1000])),
    ),
  };
}

/** Small seeded PRNG so random seeks are reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Gate {
  name: string;
  actual: number;
  limit: number;
  /** "min": actual must be at least the limit; "max": at most. */
  kind: "min" | "max";
}

export function evaluateGates(gates: readonly Gate[]): { passed: boolean; failures: string[] } {
  const failures = gates
    .filter((g) => (g.kind === "min" ? g.actual < g.limit : g.actual > g.limit))
    .map(
      (g) =>
        `${g.name}: ${g.actual.toFixed(2)} (needs ${g.kind === "min" ? "≥" : "≤"} ${String(g.limit)})`,
    );
  return { passed: failures.length === 0, failures };
}
