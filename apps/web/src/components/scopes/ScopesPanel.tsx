import type { ScopeSample } from "@lumacut/engine/scopes";
import { useEffect, useRef, useState } from "react";
import { SCOPE_H, SCOPE_INFO, SCOPE_W, drawScope, type ScopeKind } from "./render.ts";

interface ScopesPanelProps {
  /** Reads the current picture, shrunk (see `usePreview`). Resolves null when the preview isn't ready. */
  readScope: (width?: number) => Promise<ScopeSample | null>;
  /** What changes the picture: the playhead and the project document. A change triggers a refresh. */
  playheadUs: number;
  project: unknown;
  playing: boolean;
}

const MIN_GAP_MS = 120;
const PLAYING_GAP_MS = 400;

/** Waveform, RGB parade, vectorscope and histogram of the picture in the preview. */
export function ScopesPanel({ readScope, playheadUs, project, playing }: ScopesPanelProps) {
  const [kind, setKind] = useState<ScopeKind>("waveform");
  const [error, setError] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const sample = useRef<ScopeSample | null>(null);
  const lastAt = useRef(0);
  const busy = useRef(false);

  // Refresh when the picture changes (throttled) and, while playing, a few times a second.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      if (cancelled || busy.current) return;
      busy.current = true;
      lastAt.current = performance.now();
      void readScope(SCOPE_W)
        .then((s) => {
          if (cancelled || s === null) return;
          sample.current = s;
          setError(null);
          const ctx = canvas.current?.getContext("2d");
          if (ctx) drawScope(ctx, kind, s);
        })
        .catch((e: unknown) => {
          if (!cancelled) setError(String(e));
        })
        .finally(() => {
          busy.current = false;
        });
    };
    const wait = Math.max(
      0,
      lastAt.current + (playing ? PLAYING_GAP_MS : MIN_GAP_MS) - performance.now(),
    );
    timer = setTimeout(refresh, wait);
    const interval = playing ? setInterval(refresh, PLAYING_GAP_MS) : undefined;
    return () => {
      cancelled = true;
      clearTimeout(timer);
      timer = undefined;
      if (interval !== undefined) clearInterval(interval);
    };
  }, [readScope, playheadUs, project, playing, kind]);

  // Switching scope redraws the last sample at once.
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (ctx && sample.current) drawScope(ctx, kind, sample.current);
  }, [kind]);

  return (
    <section aria-label="Scopes" className="flex flex-col gap-2 p-3 text-xs">
      <div role="group" aria-label="Scope type" className="flex flex-wrap gap-1">
        {(Object.keys(SCOPE_INFO) as ScopeKind[]).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            title={`${SCOPE_INFO[k].label}: ${SCOPE_INFO[k].description}`}
            onMouseDown={(e) => {
              e.preventDefault();
            }}
            onClick={() => {
              setKind(k);
            }}
            className={`rounded px-2 py-1 ${kind === k ? "bg-sky-700 text-white" : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"}`}
          >
            {SCOPE_INFO[k].label}
          </button>
        ))}
      </div>
      <canvas
        ref={canvas}
        width={SCOPE_W}
        height={SCOPE_H}
        role="img"
        aria-label={SCOPE_INFO[kind].label}
        data-testid="scope-canvas"
        className="w-full rounded border border-neutral-800 bg-black"
      />
      <p className="text-neutral-500">{SCOPE_INFO[kind].description}</p>
      {error !== null && (
        <p role="alert" className="text-red-300">
          {error}
        </p>
      )}
    </section>
  );
}
