import { Dialog } from "radix-ui";
import { useState } from "react";
import type { ProjectSummary } from "../../api/projects.ts";

interface ProjectDeleteDialogProps {
  project: ProjectSummary | null;
  onCancel: () => void;
  /** Resolves to an error message, or null when the project is gone. */
  onConfirm: (project: ProjectSummary) => Promise<string | null>;
}

export function ProjectDeleteDialog({ project, onCancel, onConfirm }: ProjectDeleteDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog.Root
      open={project !== null}
      onOpenChange={(open) => {
        if (!open) {
          setError(null);
          onCancel();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(90vw,26rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-neutral-700 bg-neutral-900 p-5 shadow-2xl">
          <Dialog.Title className="text-base font-semibold">Delete “{project?.name}”?</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-neutral-400">
            The project and its saved versions are deleted permanently. Your media stays in the
            library. This can't be undone.
          </Dialog.Description>
          {error && (
            <p role="alert" className="mt-3 text-sm text-red-300">
              {error}
            </p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button
                type="button"
                className="h-9 rounded-lg px-3 text-sm font-medium hover:bg-neutral-800"
              >
                Keep it
              </button>
            </Dialog.Close>
            <button
              type="button"
              disabled={busy}
              className="h-9 rounded-lg bg-red-600 px-3 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
              onClick={() => {
                if (project === null) return;
                setBusy(true);
                void onConfirm(project).then((message) => {
                  setBusy(false);
                  setError(message);
                });
              }}
            >
              {busy ? "Deleting…" : "Delete project"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
