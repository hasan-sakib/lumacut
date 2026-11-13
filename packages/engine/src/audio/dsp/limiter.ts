/**
 * Keeps every sample at or below `ceiling` (linear) with a look-ahead peak limiter, in place. It
 * works on a whole buffer (offline: it can look ahead without delaying the sound): the gain needed
 * at each sample is the smallest over the next `lookaheadMs`, it ramps down linearly over that
 * look-ahead before a peak and recovers with the release time after it. Deterministic.
 */
export function limitPeaks(
  channels: Float32Array[],
  sampleRate: number,
  ceiling: number,
  lookaheadMs = 5,
  releaseMs = 80,
): void {
  const n = channels[0]?.length ?? 0;
  if (n === 0) return;
  const look = Math.max(1, Math.round((lookaheadMs / 1000) * sampleRate));
  // Gain each sample needs on its own.
  const need = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    let peak = 0;
    for (const ch of channels) peak = Math.max(peak, Math.abs(ch[i] ?? 0));
    need[i] = peak > ceiling ? ceiling / peak : 1;
  }
  // Smallest need over [i, i + look] (a sliding minimum with a monotonic queue).
  const gain = new Float32Array(n);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let i = n - 1; i >= 0; i -= 1) {
    while (tail > head && (need[queue[tail - 1] ?? 0] ?? 1) >= (need[i] ?? 1)) tail -= 1;
    queue[tail] = i;
    tail += 1;
    while ((queue[head] ?? 0) > i + look) head += 1;
    gain[i] = need[queue[head] ?? i] ?? 1;
  }
  // Release: after a peak the gain comes back up smoothly, never faster than the release time.
  const rel = 1 - Math.exp(-1 / Math.max(1, (releaseMs / 1000) * sampleRate));
  let g = 1;
  for (let i = 0; i < n; i += 1) {
    const target = gain[i] ?? 1;
    g = target < g ? target : g + (target - g) * rel;
    gain[i] = g;
  }
  // Attack: reach each reduction over the look-ahead rather than in one step.
  const step = 1 / look;
  for (let i = n - 2; i >= 0; i -= 1) {
    const after = gain[i + 1] ?? 1;
    if ((gain[i] ?? 1) > after + step) gain[i] = after + step;
  }
  for (const ch of channels) {
    for (let i = 0; i < n; i += 1) ch[i] = (ch[i] ?? 0) * (gain[i] ?? 1);
  }
}
