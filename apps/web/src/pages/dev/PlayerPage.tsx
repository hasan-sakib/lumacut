import { usToFrame } from "@lumacut/schema";
import { PlaybackSession, type Diagnostic, type FrameInfo } from "@lumacut/engine";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { playerActions, type PlayerContext, type PlayerServices } from "../../actions/player.ts";
import { useShortcuts } from "../../actions/useShortcuts.ts";
import { Icon } from "../../components/Icon.tsx";
import { Hud, type HudValues } from "../../components/player/Hud.tsx";
import { LayerControls } from "../../components/player/LayerControls.tsx";
import { Transport } from "../../components/player/Transport.tsx";
import {
  BENCH_COMPOSITION_ID,
  BENCH_FPS,
  BENCH_SIZE,
  buildBenchProject,
  type BenchLayer,
} from "../../engine/bench-project.ts";
import { readBarcode } from "../../engine/barcode.ts";
import { createApiAssetResolver } from "../../engine/resolver.ts";
import { lastFrameUs, skipTarget, stepTarget } from "../../engine/transport.ts";
import { useAssetsStore } from "../../stores/assets.ts";
import { usePlayerStore } from "../../stores/player.ts";

const RECENT_FRAMES = 60;
const HUD_INTERVAL_MS = 500;

const EMPTY_HUD: HudValues = {
  fps: 0,
  renderMsLast: 0,
  renderMsP95: 0,
  dropped: 0,
  offsetMs: null,
  cacheMb: 0,
  textureCount: 0,
  decoders: 0,
  openFrames: 0,
  framesOpened: 0,
  framesClosed: 0,
  barcode: null,
};

function percentile95(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
}

/** Timestamp for the bench document, whole seconds (the schema's date-time format). */
function isoNow(): `${string}Z` {
  return `${new Date().toISOString().slice(0, 19)}Z`;
}

/**
 * Developer test bench for the M2 engine (`/dev/player`): stack library assets as layers, play,
 * scrub and step them, change the properties M2 draws, and watch the engine's own statistics.
 */
export function PlayerPage() {
  const layers = usePlayerStore((s) => s.layers);
  const selectedId = usePlayerStore((s) => s.selectedId);
  const { addAsset, updateLayer, removeLayer, moveLayer, select, clear } = usePlayerStore();
  const assets = useAssetsStore((s) => s.byId);
  const order = useAssetsStore((s) => s.order);
  const loadAssets = useAssetsStore((s) => s.load);

  const stage = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<PlaybackSession | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [hud, setHud] = useState<HudValues>(EMPTY_HUD);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);

  // Rolling per-frame measurements; read by the HUD timer, written by frame events.
  const recent = useRef({
    presented: [] as number[],
    renderMs: [] as number[],
    offsetsMs: [] as number[],
  });
  const lastFrame = useRef<FrameInfo | null>(null);
  const barcode = useRef<number | null>(null);

  const showBarcode = useCallback(() => {
    const session = sessionRef.current;
    if (session === null || session.playing) return;
    void readBarcode(session)
      .then((value) => {
        barcode.current = value;
      })
      .catch(() => {
        barcode.current = null;
      });
  }, []);

  useEffect(() => {
    void loadAssets("");
  }, [loadAssets]);

  // The engine session. The canvas is created here (not in JSX) because its control can be
  // transferred to the worker only once, and StrictMode mounts effects twice.
  useEffect(() => {
    const host = stage.current;
    if (host === null) return;
    const canvas = document.createElement("canvas");
    canvas.width = BENCH_SIZE.width;
    canvas.height = BENCH_SIZE.height;
    canvas.setAttribute("aria-label", "Composition preview");
    canvas.className = "aspect-video w-full rounded-lg bg-black";
    host.append(canvas);
    let disposed = false;
    let created: PlaybackSession | null = null;
    void PlaybackSession.create({
      canvas,
      resolver: createApiAssetResolver(),
      compositionId: BENCH_COMPOSITION_ID,
      callbacks: {
        onChange: () => {
          setPlaying(sessionRef.current?.playing ?? false);
          showBarcode();
        },
        onFrame: (info) => {
          lastFrame.current = info;
          const r = recent.current;
          r.presented.push(performance.now());
          r.renderMs.push(info.renderMs);
          if (info.offsetUs !== null) r.offsetsMs.push(info.offsetUs / 1000);
          if (r.renderMs.length > RECENT_FRAMES) r.renderMs.shift();
          if (r.offsetsMs.length > RECENT_FRAMES) r.offsetsMs.shift();
          setDiagnostics(info.diagnostics);
        },
        onError: setError,
      },
    }).then(
      (session) => {
        if (disposed) {
          void session.dispose();
          return;
        }
        created = session;
        sessionRef.current = session;
        setReady(true);
      },
      (e: unknown) => {
        setError(`The engine couldn't start: ${String(e)}`);
      },
    );
    return () => {
      disposed = true;
      sessionRef.current = null;
      setReady(false);
      void created?.dispose();
      canvas.remove();
    };
  }, [showBarcode]);

  // Push the layer stack to the engine; edits made during a push are coalesced into the next one.
  const project = useMemo(() => buildBenchProject(layers, isoNow()), [layers]);
  const pending = useRef<typeof project | null>(null);
  const pushing = useRef(false);
  useEffect(() => {
    if (!ready) return;
    pending.current = project;
    if (pushing.current) return;
    pushing.current = true;
    void (async () => {
      try {
        while (pending.current !== null) {
          const next = pending.current;
          pending.current = null;
          await sessionRef.current?.setProject(next);
        }
        setError(null);
      } catch (e) {
        setError(String(e));
      } finally {
        pushing.current = false;
        setPlaying(sessionRef.current?.playing ?? false);
        showBarcode();
      }
    })();
  }, [project, ready, showBarcode]);

  // HUD numbers, twice a second.
  useEffect(() => {
    if (!ready) return;
    const timer = setInterval(() => {
      const session = sessionRef.current;
      if (session === null) return;
      const r = recent.current;
      const now = performance.now();
      while (r.presented.length > 0 && now - (r.presented[0] ?? now) > 1000) r.presented.shift();
      void session.snapshot().then((s) => {
        const offsets = r.offsetsMs;
        setHud({
          fps: r.presented.length,
          renderMsLast: lastFrame.current?.renderMs ?? 0,
          renderMsP95: percentile95(r.renderMs),
          dropped: lastFrame.current?.dropped ?? 0,
          offsetMs: session.playing && offsets.length > 0 ? (offsets.at(-1) ?? null) : null,
          cacheMb: s.textureBytes / (1024 * 1024),
          textureCount: s.textureCount,
          decoders: s.openIterators,
          openFrames: s.openFrames,
          framesOpened: s.framesOpened,
          framesClosed: s.framesClosed,
          barcode: barcode.current,
        });
      });
    }, HUD_INTERVAL_MS);
    return () => {
      clearInterval(timer);
    };
  }, [ready]);

  const durationUs = project.compositions[0]?.durationUs ?? 0;
  const report = useCallback((e: unknown) => {
    setError(String(e));
  }, []);

  const services = useMemo<PlayerServices>(() => {
    const seek = (us: number) => {
      sessionRef.current?.pause();
      void sessionRef.current?.seek(us).catch(report);
    };
    return {
      togglePlay: () => {
        const session = sessionRef.current;
        if (session === null) return;
        if (session.playing) session.pause();
        else void session.play().catch(report);
      },
      stepFrames: (frames) => {
        const s = sessionRef.current;
        if (s !== null) seek(stepTarget(s.timeUs, frames, BENCH_FPS, s.durationUs));
      },
      skipSeconds: (seconds) => {
        const s = sessionRef.current;
        if (s !== null) seek(skipTarget(s.timeUs, seconds, BENCH_FPS, s.durationUs));
      },
      seekToStart: () => {
        seek(0);
      },
      seekToEnd: () => {
        const s = sessionRef.current;
        if (s !== null) seek(lastFrameUs(s.durationUs, BENCH_FPS));
      },
    };
  }, [report]);

  const ctx = useMemo<PlayerContext>(
    () => ({ playing, hasContent: ready && layers.length > 0, services }),
    [playing, ready, layers.length, services],
  );
  useShortcuts(playerActions, ctx);

  const selected: BenchLayer | undefined = layers.find((l) => l.id === selectedId);
  const library = order
    .map((id) => assets[id])
    .filter((a) => a?.status === "ready" && a.kind !== null);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="flex items-center gap-4 border-b border-neutral-800 px-6 py-3">
        <Link to="/" className="text-sm text-sky-400 hover:underline">
          ← Library
        </Link>
        <h1 className="text-lg font-semibold">Player bench</h1>
        <span className="text-xs text-neutral-500">
          Developer tool for the M2 engine · {BENCH_SIZE.width}×{BENCH_SIZE.height} ·{" "}
          {BENCH_FPS.num} fps · {String(usToFrame(durationUs, BENCH_FPS))} frames
        </span>
      </header>

      <main className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex min-w-0 flex-col gap-3">
          {error && (
            <p
              role="alert"
              className="rounded-md border border-red-800 bg-red-950/40 px-3 py-2 text-sm"
            >
              {error}
            </p>
          )}
          {notice && (
            <p
              role="status"
              className="rounded-md border border-amber-700/60 bg-amber-950/40 px-3 py-2 text-sm"
            >
              {notice}
            </p>
          )}
          <div ref={stage} data-testid="stage" />
          <Transport session={sessionRef} ctx={ctx} fps={BENCH_FPS} durationUs={durationUs} />
          <Hud hud={hud} diagnostics={diagnostics} />
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          <section
            aria-label="Library"
            className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3"
          >
            <h2 className="mb-2 text-sm font-semibold">Add from library</h2>
            {library.length === 0 ? (
              <p className="text-xs text-neutral-500">
                No ready assets. Upload some in the library first.
              </p>
            ) : (
              <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                {library.map((asset) =>
                  asset === undefined ? null : (
                    <li key={asset.id} className="flex items-center gap-2 text-xs">
                      <Icon name={asset.kind ?? "file"} />
                      <span className="min-w-0 flex-1 truncate">{asset.name}</span>
                      <button
                        type="button"
                        aria-label={`Add ${asset.name} as a layer`}
                        onClick={() => {
                          setNotice(addAsset(asset));
                        }}
                        className="rounded bg-sky-600 px-2 py-0.5 text-white hover:bg-sky-500"
                      >
                        Add
                      </button>
                    </li>
                  ),
                )}
              </ul>
            )}
          </section>

          <section
            aria-label="Layers"
            className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3"
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Layers (bottom → top)</h2>
              <button
                type="button"
                onClick={clear}
                disabled={layers.length === 0}
                className="text-xs text-neutral-400 underline disabled:opacity-40"
              >
                Clear
              </button>
            </div>
            {layers.length === 0 ? (
              <p className="text-xs text-neutral-500">
                Add a video, image or audio asset to begin.
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {layers.map((layer) => (
                  <li
                    key={layer.id}
                    className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${
                      layer.id === selectedId ? "bg-sky-900/50" : "hover:bg-neutral-800"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        select(layer.id);
                      }}
                      aria-pressed={layer.id === selectedId}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <Icon name={layer.kind} />
                      <span className="truncate">{layer.name}</span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${layer.name} up`}
                      title="Move up (drawn later, on top)"
                      onClick={() => {
                        moveLayer(layer.id, 1);
                      }}
                      className="px-1 text-neutral-400 hover:text-white"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${layer.name} down`}
                      title="Move down"
                      onClick={() => {
                        moveLayer(layer.id, -1);
                      }}
                      className="px-1 text-neutral-400 hover:text-white"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${layer.name}`}
                      title="Remove layer"
                      onClick={() => {
                        removeLayer(layer.id);
                      }}
                      className="px-1 text-neutral-400 hover:text-red-400"
                    >
                      <Icon name="cancel" className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {selected && (
            <LayerControls
              layer={selected}
              onChange={(patch) => {
                updateLayer(selected.id, patch);
              }}
            />
          )}
          <p className="text-xs text-neutral-500">
            Editing a layer pauses playback (the engine reloads the project). Keys: Space play/pause
            · ←/→ frame · Shift+←/→ 1 s · Home/End.
          </p>
        </aside>
      </main>
    </div>
  );
}
