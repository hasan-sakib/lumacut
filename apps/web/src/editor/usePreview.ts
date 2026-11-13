import {
  PlaybackSession,
  type Diagnostic,
  type MeterReading,
  type ViewWindow,
} from "@lumacut/engine";
import type { ScopeSample } from "@lumacut/engine/scopes";
import type { Project, RasterMask } from "@lumacut/schema";
import { useCallback, useEffect, useRef, useState } from "react";
import { createApiAssetResolver } from "../engine/resolver.ts";
import { useEditorStore } from "../stores/editor.ts";

export interface Preview {
  /** Attach to the element the picture is drawn into (the canvas is created inside it). */
  attachStage: (element: HTMLDivElement | null) => void;
  ready: boolean;
  playing: boolean;
  /** Things the engine could not draw on the last frame. */
  diagnostics: Diagnostic[];
  error: string | null;
  togglePlay: () => void;
  /** Move the playhead (and the picture and sound if playing). */
  seek: (us: number) => void;
  /** The current picture shrunk to `width` pixels across (for the video scopes), or null before the preview is ready. */
  readScope: (width?: number) => Promise<ScopeSample | null>;
  /**
   * Draw only this window of the composition (composition pixels, with the output scale), or all
   * of it (null). The canvas then holds just the window, so the page must position it. Used by the
   * photo editor to render the visible part of a large canvas at screen resolution.
   */
  setView: (view: ViewWindow | null) => void;
  /** Levels and running loudness of the mix (null before the preview is ready). */
  meters: () => MeterReading | null;
  /** Starts a new running loudness measurement. */
  resetLoudness: () => void;
  /** Moves a track's (null: the master's) level on the playing sound while a fader is dragged. */
  previewLevel: (trackId: string | null, volume: number, pan?: number) => void;
  /** Shows a bitmap mask live while it is painted (null clears it); the bitmap is handed over. */
  setMaskOverride: (
    maskId: string,
    entry: { clipId: string; mask: RasterMask; bitmap: ImageBitmap } | null,
  ) => Promise<void>;
}

/**
 * The editor's preview: one playback session for the composition, kept in step with the project
 * document and the playhead. Edits reload the engine's project (which pauses playback: a known
 * M2 limit). While playing, the editor's playhead follows the audio clock; while paused, any
 * change of the playhead shows that frame.
 */
export function usePreview(project: Project | null, compositionId: string | null): Preview {
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  const sessionRef = useRef<PlaybackSession | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [error, setError] = useState<string | null>(null);
  // The window asked for most recently; applied when a session starts and on every change.
  const wantedView = useRef<ViewWindow | null>(null);

  // The session. The canvas is made here, not in JSX: its control can be handed to the worker only once.
  useEffect(() => {
    if (stage === null || compositionId === null) return;
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-label", "Composition preview");
    canvas.className = "h-full w-full object-contain";
    stage.append(canvas);
    let disposed = false;
    let created: PlaybackSession | null = null;
    void PlaybackSession.create({
      canvas,
      resolver: createApiAssetResolver(),
      compositionId,
      callbacks: {
        onChange: () => {
          const session = sessionRef.current;
          if (session === null) return;
          setPlaying(session.playing);
          if (!session.playing) useEditorStore.getState().setPlayhead(session.timeUs);
        },
        onFrame: (info) => {
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
        if (wantedView.current !== null) void session.setView(wantedView.current);
        setReady(true);
      },
      (e: unknown) => {
        setError(`The preview couldn't start: ${String(e)}`);
      },
    );
    return () => {
      disposed = true;
      sessionRef.current = null;
      setReady(false);
      setPlaying(false);
      void created?.dispose();
      canvas.remove();
    };
  }, [compositionId, stage]);

  // Give the engine each new version of the project; edits made meanwhile coalesce into the next push.
  const pending = useRef<Project | null>(null);
  const pushing = useRef(false);
  useEffect(() => {
    if (!ready || project === null) return;
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
      }
    })();
  }, [project, ready]);

  // Playing: the playhead follows the audio clock.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const session = sessionRef.current;
      if (session !== null) useEditorStore.getState().setPlayhead(session.timeUs);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [playing]);

  // Paused: moving the playhead (ruler click, stepping, marker jump) shows that frame.
  useEffect(
    () =>
      useEditorStore.subscribe((state, previous) => {
        const session = sessionRef.current;
        if (session === null || state.playheadUs === previous.playheadUs) return;
        if (!session.playing && session.timeUs !== state.playheadUs)
          void session.seek(state.playheadUs);
      }),
    [],
  );

  const togglePlay = useCallback(() => {
    const session = sessionRef.current;
    if (session === null) return;
    if (session.playing) {
      session.pause();
    } else {
      // Start from the playhead the user sees (it may have been moved while paused).
      void session
        .seek(useEditorStore.getState().playheadUs)
        .then(() => session.play())
        .catch((e: unknown) => {
          setError(String(e));
        });
    }
  }, []);

  const seek = useCallback((us: number) => {
    useEditorStore.getState().setPlayhead(us);
    const session = sessionRef.current;
    if (session?.playing) void session.seek(Math.max(0, Math.round(us)));
  }, []);

  const readScope = useCallback(async (width = 320): Promise<ScopeSample | null> => {
    const session = sessionRef.current;
    return session === null ? null : session.readScope(width);
  }, []);

  const setView = useCallback((view: ViewWindow | null) => {
    wantedView.current = view;
    const session = sessionRef.current;
    if (session === null) return;
    session.setView(view).catch((e: unknown) => {
      setError(String(e));
    });
  }, []);

  const meters = useCallback((): MeterReading | null => sessionRef.current?.meters() ?? null, []);
  const resetLoudness = useCallback(() => {
    sessionRef.current?.resetLoudness();
  }, []);

  const previewLevel = useCallback((trackId: string | null, volume: number, pan = 0) => {
    sessionRef.current?.previewLevel(trackId, volume, pan);
  }, []);

  const setMaskOverride = useCallback(
    async (
      maskId: string,
      entry: { clipId: string; mask: RasterMask; bitmap: ImageBitmap } | null,
    ) => {
      await sessionRef.current?.setMaskOverride(maskId, entry);
    },
    [],
  );

  return {
    attachStage: setStage,
    ready,
    playing,
    diagnostics,
    error,
    togglePlay,
    seek,
    readScope,
    setView,
    setMaskOverride,
    meters,
    resetLoudness,
    previewLevel,
  };
}
