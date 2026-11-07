import type { ItemKeyState } from "../../inspector/animation.ts";

interface KeyframeToggleProps {
  /** The property's name, for the tooltip and the accessible label. */
  label: string;
  state: ItemKeyState;
  /** False when the playhead is off the clip: a keyframe can't be added there. */
  enabled: boolean;
  onToggle: () => void;
}

const DESCRIPTIONS: Record<ItemKeyState, string> = {
  none: "Not animated. Click to add a keyframe at the playhead and start animating.",
  animated: "Animated. Click to add a keyframe at the playhead.",
  key: "Keyframe at the playhead. Click to remove it.",
  mixed: "The selected clips differ. Click to toggle a keyframe on each at the playhead.",
};

/**
 * The ◆ shown next to every animatable property (same control everywhere, CLAUDE.md rule 9):
 * hollow = not animated, outlined in blue = animated here but no keyframe at the playhead,
 * filled = a keyframe sits on the playhead.
 */
export function KeyframeToggle({ label, state, enabled, onToggle }: KeyframeToggleProps) {
  const filled = state === "key";
  const animated = state !== "none";
  const action = filled ? "Remove" : "Add";
  const tip = enabled
    ? `${label} keyframe: ${DESCRIPTIONS[state]}`
    : `${label} keyframe: move the playhead onto the clip to add one.`;
  return (
    <button
      type="button"
      title={tip}
      aria-label={`${action} ${label} keyframe at the playhead`}
      aria-pressed={filled}
      disabled={!enabled}
      data-keyframe-state={state}
      onMouseDown={(event) => {
        event.preventDefault(); // keep the keyboard focus where it was (Space still plays)
      }}
      onClick={onToggle}
      className="flex h-5 w-5 items-center justify-center rounded text-neutral-500 hover:bg-neutral-800 disabled:opacity-30"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <path
          d="M6 1 11 6 6 11 1 6Z"
          fill={filled ? "#38bdf8" : "none"}
          stroke={animated ? "#38bdf8" : "currentColor"}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
