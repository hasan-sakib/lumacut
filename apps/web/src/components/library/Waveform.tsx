/** audiowaveform v2 JSON (from the worker) rendered as a bar chart. */

export interface WaveformData {
  channels: number;
  length: number;
  data: number[];
}

/** Reduce to `bars` peak magnitudes in [0, 1] (max |min|/|max| over channels per bucket). */
export function waveformBars(waveform: WaveformData, bars: number): number[] {
  const perPixel = waveform.channels * 2;
  const out: number[] = [];
  for (let b = 0; b < bars; b += 1) {
    const start = Math.floor((b * waveform.length) / bars);
    const end = Math.max(start + 1, Math.floor(((b + 1) * waveform.length) / bars));
    let peak = 0;
    for (let px = start; px < end && px < waveform.length; px += 1) {
      for (let i = 0; i < perPixel; i += 1)
        peak = Math.max(peak, Math.abs(waveform.data[px * perPixel + i] ?? 0));
    }
    out.push(Math.min(1, peak / 127));
  }
  return out;
}

export function Waveform({
  waveform,
  bars = 96,
  className = "",
}: {
  waveform: WaveformData;
  bars?: number;
  className?: string;
}) {
  const values = waveformBars(waveform, bars);
  return (
    <svg
      viewBox={`0 0 ${String(bars)} 100`}
      preserveAspectRatio="none"
      className={className}
      role="img"
      aria-label="Audio waveform"
      data-testid="waveform"
    >
      {values.map((v, i) => {
        const h = Math.max(2, v * 100);
        return (
          <rect
            key={i}
            x={i + 0.15}
            y={(100 - h) / 2}
            width={0.7}
            height={h}
            className="fill-sky-400/80"
          />
        );
      })}
    </svg>
  );
}
