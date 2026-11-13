import type { AnyAction } from "@lumacut/actions";
import type { Level, MeterReading } from "@lumacut/engine";
import type { Composition } from "@lumacut/schema";
import { useEffect, useState } from "react";
import { editingActions, type EditingContext } from "../../actions/editing.ts";
import { useAudioStore } from "../../stores/audio.ts";
import { ActionButton } from "../ActionButton.tsx";
import { Fader } from "./Fader.tsx";
import { Meter } from "./Meter.tsx";

interface MixerPanelProps {
  composition: Composition;
  ctx: EditingContext;
  playing: boolean;
  /** Current levels (null before the preview is ready). */
  readMeters: () => MeterReading | null;
  previewLevel: (trackId: string | null, volume: number, pan?: number) => void;
  resetLoudness: () => void;
  onRunAction: (action: AnyAction<EditingContext>, args?: unknown) => void;
  run: (id: string, args?: unknown) => Promise<string | null>;
}

const SILENT: Level = { peak: Number.NEGATIVE_INFINITY, rms: Number.NEGATIVE_INFINITY };
const lufs = (v: number | undefined): string =>
  v === undefined || !Number.isFinite(v) ? "—" : v.toFixed(1);

/**
 * The audio mixer: a strip per audio track (meter, fader, pan, mute, solo) and the master (stereo
 * meter, fader, live loudness, an exact measurement of the whole mix, export at a loudness target).
 */
export function MixerPanel(props: MixerPanelProps) {
  const { composition, ctx, playing, readMeters, onRunAction } = props;
  const [reading, setReading] = useState<MeterReading | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const measured = useAudioStore((s) => s.measured);
  const target = useAudioStore((s) => s.target);
  const setTarget = useAudioStore((s) => s.setTarget);
  const tracks = composition.tracks.filter((t) => t.kind === "audio");

  // Meters refresh about 20 times a second while the panel is open.
  useEffect(() => {
    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      if (now - last > 50) {
        last = now;
        setReading(readMeters());
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [readMeters]);

  const act = async (id: string, args?: unknown) => {
    setBusy(id);
    setMessage(null);
    const error = await props.run(id, args);
    setBusy(null);
    setMessage(error);
  };
  const press = (e: React.MouseEvent) => {
    e.preventDefault();
  };
  const masterGain = composition.audio?.volume ?? 1;
  const live = reading?.loudness;
  const offTarget =
    measured !== null && Number.isFinite(measured.integrated) ? measured.integrated - target : null;

  return (
    <section aria-label="Mixer" className="flex h-full min-h-0 gap-2 overflow-x-auto p-2 text-xs">
      {tracks.length === 0 && (
        <p className="self-center px-4 text-neutral-500">
          No audio tracks. Add sound from the library.
        </p>
      )}
      {tracks.map((track) => {
        const level = reading?.tracks[track.id] ?? SILENT;
        const pan = track.audio?.pan ?? 0;
        return (
          <div
            key={track.id}
            data-testid="channel-strip"
            className="flex w-24 shrink-0 flex-col items-center gap-1 rounded border border-neutral-800 bg-neutral-900/60 p-1"
          >
            <span className="w-full truncate text-center text-neutral-200" title={track.name}>
              {track.name}
            </span>
            <label className="flex w-full items-center gap-1 text-[10px] text-neutral-400">
              Pan
              <input
                type="range"
                min={-100}
                max={100}
                step={1}
                defaultValue={Math.round(pan * 100)}
                key={`${track.id}:${String(pan)}`}
                aria-label={`${track.name} pan`}
                title="Left … right (double-click to centre)"
                onChange={(e) => {
                  props.previewLevel(
                    track.id,
                    track.audio?.volume ?? 1,
                    Number(e.target.value) / 100,
                  );
                }}
                onPointerUp={(e) => {
                  void props.run("track.setPan", {
                    trackId: track.id,
                    pan: Number(e.currentTarget.value),
                  });
                }}
                onKeyUp={(e) => {
                  void props.run("track.setPan", {
                    trackId: track.id,
                    pan: Number(e.currentTarget.value),
                  });
                }}
                onDoubleClick={() => {
                  void props.run("track.setPan", { trackId: track.id, pan: 0 });
                }}
                className="min-w-0 flex-1"
              />
            </label>
            <div className="flex min-h-0 flex-1 items-stretch gap-1">
              <Meter level={level} label={`${track.name} level`} />
              <Fader
                label={`${track.name} volume`}
                gain={track.audio?.volume ?? 1}
                onPreview={(gain) => {
                  props.previewLevel(track.id, gain, pan);
                }}
                onCommit={(db) => {
                  void props.run("track.setVolume", { trackId: track.id, db });
                }}
              />
            </div>
            <div className="flex gap-0.5">
              <ActionButton
                action={editingActions.get("track.toggleMute")}
                ctx={ctx}
                variant="icon"
                args={{ trackId: track.id }}
                pressed={track.muted}
                onRun={onRunAction}
                className={
                  track.muted ? "bg-amber-700 text-white" : "text-neutral-300 hover:bg-neutral-800"
                }
              />
              <ActionButton
                action={editingActions.get("track.toggleSolo")}
                ctx={ctx}
                variant="icon"
                args={{ trackId: track.id }}
                pressed={track.solo}
                onRun={onRunAction}
                className={
                  track.solo ? "bg-sky-700 text-white" : "text-neutral-300 hover:bg-neutral-800"
                }
              />
            </div>
          </div>
        );
      })}

      <div
        data-testid="master-strip"
        className="ml-auto flex shrink-0 gap-2 rounded border border-neutral-700 bg-neutral-900 p-2"
      >
        <div className="flex w-20 flex-col items-center gap-1">
          <span className="font-semibold text-neutral-100">Master</span>
          <div className="flex min-h-0 flex-1 items-stretch gap-1">
            <Meter level={reading?.master.left ?? SILENT} label="Master left" />
            <Meter level={reading?.master.right ?? SILENT} label="Master right" />
            <Fader
              label="Master volume"
              gain={masterGain}
              onPreview={(gain) => {
                props.previewLevel(null, gain);
              }}
              onCommit={(db) => {
                void props.run("mixer.setMasterVolume", { db });
              }}
            />
          </div>
        </div>
        <div className="flex w-56 flex-col gap-1.5">
          <h3 className="font-semibold text-neutral-200">Loudness</h3>
          <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5 tabular-nums">
            <dt className="text-neutral-400" title="Last 400 ms">
              Momentary
            </dt>
            <dd>{lufs(live?.momentary)} LUFS</dd>
            <dt className="text-neutral-400" title="Last 3 seconds">
              Short-term
            </dt>
            <dd>{lufs(live?.shortTerm)} LUFS</dd>
            <dt className="text-neutral-400" title="Everything heard since the last reset (gated)">
              Integrated
            </dt>
            <dd>{lufs(live?.integrated)} LUFS</dd>
          </dl>
          <p className="text-[10px] text-neutral-500">
            {playing ? "Live, while playing (approximate)." : "Play to see live loudness."}{" "}
            <button
              type="button"
              onMouseDown={press}
              onClick={props.resetLoudness}
              className="text-sky-400 hover:underline"
            >
              Reset
            </button>
          </p>
          <label className="flex items-center gap-1 text-neutral-300">
            Target
            <select
              value={target}
              aria-label="Loudness target"
              onChange={(e) => {
                setTarget(Number(e.target.value));
              }}
              className="rounded border border-neutral-700 bg-neutral-950 px-1 py-0.5"
            >
              <option value={-14}>−14 LUFS (social, streaming)</option>
              <option value={-23}>−23 LUFS (broadcast, EBU R 128)</option>
            </select>
          </label>
          {measured !== null && (
            <p data-testid="measured-loudness" className="tabular-nums text-neutral-200">
              Whole mix: <strong>{lufs(measured.integrated)} LUFS</strong>, peak{" "}
              {lufs(measured.truePeak)} dBTP
              {offTarget !== null && (
                <span
                  className={Math.abs(offTarget) <= 1 ? " text-emerald-400" : " text-amber-400"}
                >
                  {" "}
                  ({offTarget > 0 ? "+" : ""}
                  {offTarget.toFixed(1)} LU from target)
                </span>
              )}
            </p>
          )}
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              disabled={busy !== null}
              title={editingActions.get("audio.measureLoudness").description}
              onMouseDown={press}
              onClick={() => void act("audio.measureLoudness")}
              className="rounded bg-neutral-800 px-2 py-1 text-neutral-200 hover:bg-neutral-700 disabled:opacity-50"
            >
              {busy === "audio.measureLoudness" ? "Measuring…" : "Measure mix"}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              title={editingActions.get("export.audio").description}
              onMouseDown={press}
              onClick={() =>
                void act("export.audio", { target: target === -23 ? "broadcast" : "social" })
              }
              className="rounded bg-sky-700 px-2 py-1 text-white hover:bg-sky-600 disabled:opacity-50"
            >
              {busy === "export.audio" ? "Rendering…" : "Export WAV at target"}
            </button>
          </div>
          {message !== null && (
            <p role="alert" className="rounded bg-red-950/60 px-2 py-1 text-red-300">
              {message}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
