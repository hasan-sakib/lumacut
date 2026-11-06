/**
 * Time source for measurements (render timings, benchmarks). Render code never reads the wall
 * clock directly (rule 6): anything that needs "now" takes a Clock, so output can't depend on it.
 */
export interface Clock {
  nowMs(): number;
}

export const performanceClock: Clock = {
  nowMs: () => performance.now(),
};
