import type { Diagnostic } from "@lumacut/engine";

export interface HudValues {
  fps: number;
  renderMsLast: number;
  renderMsP95: number;
  dropped: number;
  /** Audio clock minus the picture's time while playing (ms), or null when paused. */
  offsetMs: number | null;
  cacheMb: number;
  textureCount: number;
  decoders: number;
  openFrames: number;
  framesOpened: number;
  framesClosed: number;
  barcode: number | null;
}

function Row({
  label,
  value,
  hint,
  testId,
}: {
  label: string;
  value: string;
  hint?: string;
  testId: string;
}) {
  return (
    <div className="flex justify-between gap-3" title={hint}>
      <dt className="text-neutral-400">{label}</dt>
      <dd className="font-mono text-neutral-100" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}

/** Live engine numbers (the bench's reason to exist) and everything the engine didn't draw. */
export function Hud({ hud, diagnostics }: { hud: HudValues; diagnostics: Diagnostic[] }) {
  return (
    <section aria-label="Engine statistics" className="flex flex-col gap-3">
      <dl className="grid gap-1 rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 text-xs">
        <Row testId="hud-fps" label="Presented fps" value={hud.fps.toFixed(1)} />
        <Row
          testId="hud-render-ms"
          label="Render ms (last / p95)"
          value={`${hud.renderMsLast.toFixed(1)} / ${hud.renderMsP95.toFixed(1)}`}
        />
        <Row testId="hud-dropped" label="Dropped frames" value={String(hud.dropped)} />
        <Row
          testId="hud-offset"
          label="A/V offset"
          value={hud.offsetMs === null ? "—" : `${hud.offsetMs.toFixed(0)} ms`}
          hint="Audio clock minus the time of the picture just presented (includes worker latency)."
        />
        <Row
          testId="hud-cache"
          label="Texture cache"
          value={`${hud.cacheMb.toFixed(1)} MB (${String(hud.textureCount)})`}
        />
        <Row testId="hud-decoders" label="Decoders open" value={String(hud.decoders)} />
        <Row
          testId="hud-open-frames"
          label="Open frames"
          value={`${String(hud.openFrames)}  (${String(hud.framesOpened)} opened / ${String(hud.framesClosed)} closed)`}
        />
        <Row
          testId="hud-barcode"
          label="Barcode frame"
          value={hud.barcode === null ? "—" : String(hud.barcode)}
          hint="Frame number read from the test pattern's barcode strip while paused. Only readable when the barcode clip fills the composition unscaled."
        />
      </dl>
      <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 text-xs">
        <h3 className="mb-1 font-semibold text-neutral-200">Not drawn / problems</h3>
        {diagnostics.length === 0 ? (
          <p className="text-neutral-500">Nothing was skipped on the last frame.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {diagnostics.map((d) => (
              <li key={`${d.clipId ?? "-"}:${d.code}`} className="text-amber-300">
                <span className="font-mono">{d.code}</span> — {d.message}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
