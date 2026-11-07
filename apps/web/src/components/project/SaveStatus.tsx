import type { SaveState } from "../../stores/project.ts";

const TEXT: Record<SaveState, string> = {
  saved: "All changes saved",
  dirty: "Unsaved changes…",
  saving: "Saving…",
  offline: "Offline: will retry",
  conflict: "Changed elsewhere",
  error: "Couldn't save",
};

const TONE: Record<SaveState, string> = {
  saved: "text-neutral-400",
  dirty: "text-neutral-300",
  saving: "text-neutral-300",
  offline: "text-amber-300",
  conflict: "text-red-300",
  error: "text-red-300",
};

/** The autosave indicator; announced politely to screen readers when it changes. */
export function SaveStatus({ state, detail }: { state: SaveState; detail?: string | null }) {
  return (
    <span
      role="status"
      aria-live="polite"
      data-testid="save-status"
      data-state={state}
      title={detail ?? undefined}
      className={`text-xs ${TONE[state]}`}
    >
      {TEXT[state]}
    </span>
  );
}
