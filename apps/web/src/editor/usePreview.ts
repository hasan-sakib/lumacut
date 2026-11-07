import { PlaybackSession, type Diagnostic } from "@lumacut/engine";
import type { Project } from "@lumacut/schema";
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

  return { attachStage: setStage, ready, playing, diagnostics, error, togglePlay, seek };
}
