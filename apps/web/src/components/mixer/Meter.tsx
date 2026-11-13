import type { Level } from "@lumacut/engine";

/** dBFS shown at the bottom and top of a meter. */
const FLOOR = -60;
const TOP = 6;

const fraction = (db: number): number =>
  Number.isFinite(db) ? Math.min(1, Math.max(0, (db - FLOOR) / (TOP - FLOOR))) : 0;

const colourOf = (db: number): string =>
  db > -1 ? "bg-red-500" : db > -9 ? "bg-amber-400" : "bg-emerald-500";

/** A vertical level meter: RMS as the bar, peak as a line (green, amber near −9 dB, red over −1 dB). */
export function Meter({ level, label }: { level: Level; label: string }) {
  const rms = fraction(level.rms);
  const peak = fraction(level.peak);
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={FLOOR}
      aria-valuemax={TOP}
      aria-valuenow={Number.isFinite(level.peak) ? Math.round(level.peak) : FLOOR}
      title={`${label}: peak ${Number.isFinite(level.peak) ? level.peak.toFixed(1) : "−∞"} dB`}
      className="relative h-full w-2 overflow-hidden rounded-sm bg-neutral-800"
    >
      <div
        className={`absolute inset-x-0 bottom-0 ${colourOf(level.peak)}`}
        style={{ height: `${String(rms * 100)}%` }}
      />
      <div
        className="absolute inset-x-0 h-px bg-white"
        style={{ bottom: `${String(peak * 100)}%` }}
      />
      {/* 0 dB mark */}
      <div
        className="absolute inset-x-0 h-px bg-neutral-500"
        style={{ bottom: `${String(fraction(0) * 100)}%` }}
      />
    </div>
  );
}
