import type { PlaybackSession } from "@lumacut/engine";
import { frameToUs, usToFrame, type Rational } from "@lumacut/schema";
import { useEffect, useState, type RefObject } from "react";
import { playerActions, type PlayerContext } from "../../actions/player.ts";
import { formatTimecode, lastFrameUs } from "../../engine/transport.ts";
import { ActionButton } from "../ActionButton.tsx";

interface TransportProps {
  session: RefObject<PlaybackSession | null>;
  ctx: PlayerContext;
  fps: Rational;
  durationUs: number;
}

const BUTTONS = [
  "player.goToStart",
  "player.skipBack",
  "player.stepBack",
  "player.playPause",
  "player.stepForward",
  "player.skipForward",
  "player.goToEnd",
] as const;

/** Transport buttons, timecode and scrub bar. Owns the per-frame playhead state so only it re-renders. */
export function Transport({ session, ctx, fps, durationUs }: TransportProps) {
  const [timeUs, setTimeUs] = useState(0);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const t = session.current?.timeUs ?? 0;
      setTimeUs((prev) => (prev === t ? prev : t));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [session]);

  const lastFrame = usToFrame(lastFrameUs(durationUs, fps), fps);
  const frame = Math.min(usToFrame(Math.min(timeUs, lastFrameUs(durationUs, fps)), fps), lastFrame);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1">
        {BUTTONS.map((id) => (
          <ActionButton
            key={id}
            action={playerActions.get(id)}
            ctx={ctx}
            variant="icon"
            className="text-neutral-200 hover:bg-neutral-800"
          />
        ))}
        <span
          aria-label="Timecode"
          className="ml-3 font-mono text-sm text-neutral-100"
          data-testid="timecode"
        >
          {formatTimecode(timeUs, fps)}
        </span>
        <span className="ml-3 font-mono text-xs text-neutral-500" data-testid="frame-number">
          frame {frame} / {lastFrame}
        </span>
        <span className="ml-auto text-xs text-neutral-400" data-testid="play-state">
          {ctx.playing ? "Playing" : "Paused"}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={Math.max(lastFrame, 1)}
        step={1}
        value={frame}
        aria-label="Scrub"
        disabled={!ctx.hasContent}
        onChange={(e) => {
          void session.current?.seek(frameToUs(Number(e.target.value), fps));
        }}
        className="w-full accent-sky-500"
      />
    </div>
  );
}
