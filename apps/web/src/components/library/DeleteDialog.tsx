import { Dialog } from "radix-ui";
import { useState } from "react";
import type { AssetOut } from "../../api/client.ts";

interface DeleteDialogProps {
  asset: AssetOut | null;
  onCancel: () => void;
  onConfirm: (asset: AssetOut) => Promise<string | null>;
}

export function DeleteDialog({ asset, onCancel, onConfirm }: DeleteDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog.Root
      open={asset !== null}
      onOpenChange={(open) => {
        if (!open) {
          setError(null);
          onCancel();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(90vw,26rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-neutral-700 bg-neutral-900 p-5 shadow-2xl">
          <Dialog.Title className="text-base font-semibold">Delete “{asset?.name}”?</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-neutral-400">
            The original file and every rendition are deleted permanently. This can't be undone.
          </Dialog.Description>
          {error && (
            <p role="alert" className="mt-3 text-sm text-red-300">
              {error}
            </p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button type="button" className="rounded-md px-3 py-1.5 text-sm hover:bg-neutral-800">
                Keep it
              </button>
            </Dialog.Close>
            <button
              type="button"
              disabled={busy}
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
              onClick={() => {
                if (asset === null) return;
                setBusy(true);
                void onConfirm(asset).then((message) => {
                  setBusy(false);
                  setError(message);
                });
              }}
            >
              {busy ? "Deleting…" : "Delete"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
