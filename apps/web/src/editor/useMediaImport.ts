import { useCallback, useEffect, useRef } from "react";
import type { PickedFile } from "../lib/files.ts";
import { toProjectAsset } from "../lib/project-assets.ts";
import { useAssetsStore } from "../stores/assets.ts";
import { useUploadsStore } from "../stores/uploads.ts";

type ProjectKind = "video" | "motion" | "photo";

/** What the file picker offers, per kind of project. */
export function importAccept(kind: ProjectKind | undefined): string {
  return kind === "photo" ? "image/*" : "video/*,audio/*,image/*";
}

/** Can this file go into this kind of project? (An unknown type is left for the server to judge.) */
function fits(file: File, kind: ProjectKind | undefined): boolean {
  if (kind === "photo") return file.type.startsWith("image/");
  return file.type === "" || /^(video|audio|image)\//.test(file.type);
}

interface Pending {
  key: string;
  assetId: string | null;
  done: boolean;
}

interface MediaImportOptions {
  kind: ProjectKind | undefined;
  /** Runs an editing action; resolves with an error message or null. */
  run: (id: string, args?: unknown) => Promise<string | null>;
  onNotice: (message: string) => void;
}

/**
 * Importing files from inside the editor: they upload to the library and, as each one finishes
 * processing, it is put into the project (the end of the main track; a new layer in a photo), in
 * the order they were chosen and one undo step each. Only uploads started here are added: one
 * interrupted by a refresh just shows up in the Media tab when it is ready.
 */
export function useMediaImport({ kind, run, onNotice }: MediaImportOptions): {
  importFiles: (files: PickedFile[]) => void;
} {
  const pending = useRef<Pending[]>([]);
  const busy = useRef(false);
  const latest = useRef({ run, onNotice });
  useEffect(() => {
    latest.current = { run, onNotice };
  }, [run, onNotice]);

  const flush = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      // An upload's entry (and with it the asset id) disappears when it finishes, so note every
      // id now, not only the id of the file whose turn it is.
      for (const item of pending.current) {
        const id = useUploadsStore.getState().entries[item.key]?.assetId;
        if (id != null) item.assetId = id;
      }
      for (const item of pending.current) {
        if (item.done) continue;
        const upload = useUploadsStore.getState().entries[item.key];
        if (upload !== undefined) {
          // Still uploading: wait. Failed: its card says why; nothing to add.
          if (upload.state === "failed") {
            item.done = true;
            continue;
          }
          break;
        }
        const asset =
          item.assetId === null ? undefined : useAssetsStore.getState().byId[item.assetId];
        // Cancelled (the upload and its asset are gone).
        if (asset === undefined) {
          item.done = true;
          continue;
        }
        if (asset.status === "failed") {
          item.done = true;
          latest.current.onNotice(
            `“${asset.name}” couldn't be processed${asset.errorMessage ? `: ${asset.errorMessage}` : "."}`,
          );
          continue;
        }
        // "Ready" arrives a moment before the media details (size, length); wait for those too.
        if (asset.status !== "ready" || toProjectAsset(asset) === null) break;
        item.done = true;
        const message = await latest.current.run("timeline.addAssetAtPlayhead", {
          asset: asset.id,
          at: "end",
        });
        if (message !== null) latest.current.onNotice(message);
      }
      pending.current = pending.current.filter((p) => !p.done);
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    const check = () => {
      if (pending.current.length > 0) void flush();
    };
    const stopUploads = useUploadsStore.subscribe(check);
    const stopAssets = useAssetsStore.subscribe(check);
    return () => {
      stopUploads();
      stopAssets();
    };
  }, [flush]);

  const importFiles = useCallback(
    (files: PickedFile[]) => {
      const wanted = files.filter((f) => fits(f.file, kind));
      const refused = files.length - wanted.length;
      if (refused > 0) {
        onNotice(
          kind === "photo"
            ? "A photo project takes images only. Other files were left out."
            : "Only video, audio and image files can be imported. Other files were left out.",
        );
      }
      if (wanted.length === 0) return;
      const keys = useUploadsStore.getState().start(wanted);
      pending.current.push(...keys.map((key) => ({ key, assetId: null, done: false })));
    },
    [kind, onNotice],
  );

  return { importFiles };
}
