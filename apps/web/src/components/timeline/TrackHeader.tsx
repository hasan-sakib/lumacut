import type { AnyAction } from "@lumacut/actions";
import type { Track } from "@lumacut/schema";
import { editingActions, type EditingContext } from "../../actions/editing.ts";
import { ActionButton } from "../ActionButton.tsx";
import { Icon } from "../Icon.tsx";
import { HEADER_WIDTH, LANE_HEIGHT } from "./layout.ts";

interface TrackHeaderProps {
  track: Track;
  selected: boolean;
  ctx: EditingContext;
  onSelect: () => void;
  onRun: (action: AnyAction<EditingContext>, args?: unknown) => void;
}

const TOGGLES = [
  ["track.toggleMute", "muted"],
  ["track.toggleSolo", "solo"],
  ["track.toggleLock", "locked"],
  ["track.toggleHide", "hidden"],
] as const;

/** Name and switches of one track. Each switch is the same action as in the palette, aimed at this track. */
export function TrackHeader({ track, selected, ctx, onSelect, onRun }: TrackHeaderProps) {
  return (
    <div
      data-testid="track-header"
      data-track={track.id}
      className={`flex flex-col justify-center gap-1 border-b border-neutral-800 px-2 ${selected ? "bg-sky-950" : "bg-neutral-900"}`}
      style={{ width: HEADER_WIDTH, height: LANE_HEIGHT }}
    >
      <button
        type="button"
        onClick={onSelect}
        onMouseDown={(event) => {
          event.preventDefault();
        }}
        aria-pressed={selected}
        className="flex items-center gap-1.5 truncate text-left text-sm font-medium text-neutral-100"
      >
        <Icon name={track.kind === "visual" ? "video" : "audio"} className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{track.name}</span>
      </button>
      <div className="flex gap-0.5">
        {TOGGLES.map(([id, prop]) => (
          <ActionButton
            key={id}
            action={editingActions.get(id)}
            ctx={ctx}
            variant="icon"
            args={{ trackId: track.id }}
            pressed={track[prop]}
            onRun={onRun}
            className="!px-1.5 !py-1 text-neutral-300 hover:bg-neutral-800"
          />
        ))}
      </div>
    </div>
  );
}
