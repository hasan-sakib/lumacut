import { del, get as idbGet, set as idbSet } from "idb-keyval";
import { create } from "zustand";
import { api, errorMessage } from "../api/client.ts";
import { fileFromHandle, type PickedFile } from "../lib/files.ts";
import { runUpload, xhrPutPart, type UploadApi } from "../lib/uploader.ts";
import { useAssetsStore } from "./assets.ts";

/** Persisted per in-flight upload so it can resume after a refresh. */
interface StoredUpload {
  assetId: string;
  name: string;
  size: number;
  lastModified: number;
  handle?: FileSystemFileHandle;
}

export interface UploadEntry {
  key: string;
  assetId: string | null;
  name: string;
  size: number;
  uploadedBytes: number;
  state: "uploading" | "failed";
  error: string | null;
}

interface UploadsState {
  entries: Record<string, UploadEntry>;
  start: (files: PickedFile[]) => void;
  /** Resume an upload left `uploading` on the server (e.g. after a refresh). */
  resume: (
    assetId: string,
    pick: (name: string) => Promise<PickedFile | null>,
  ) => Promise<string | null>;
  cancel: (key: string) => Promise<void>;
  dismiss: (key: string) => void;
}

const storageKey = (assetId: string) => `lumacut.upload.${assetId}`;
const controllers = new Map<string, AbortController>();

function fail(error: unknown, fallback: string): never {
  throw new Error(errorMessage(error, fallback));
}

export const uploadApi: UploadApi = {
  async create(file) {
    const { data, error } = await api.POST("/api/uploads", {
      body: {
        fileName: file.name,
        sizeBytes: file.size,
        mimeType: file.type || "application/octet-stream",
      },
    });
    return data ?? fail(error, "Couldn't start the upload.");
  },
  async status(assetId) {
    const { data, error } = await api.GET("/api/uploads/{asset_id}", {
      params: { path: { asset_id: assetId } },
    });
    return data ?? fail(error, "Couldn't check the upload.");
  },
  async partUrls(assetId, partNumbers) {
    const { data, error } = await api.POST("/api/uploads/{asset_id}/part-urls", {
      params: { path: { asset_id: assetId } },
      body: { partNumbers },
    });
    const urls = data?.urls ?? fail(error, "Couldn't prepare the upload.");
    return new Map(urls.map((u) => [u.partNumber, u.url]));
  },
  async complete(assetId) {
    const { data, error } = await api.POST("/api/uploads/{asset_id}/complete", {
      params: { path: { asset_id: assetId } },
    });
    if (data === undefined) fail(error, "Couldn't finish the upload.");
  },
};

let localKeys = 0;

export const useUploadsStore = create<UploadsState>()((set, get) => {
  const patch = (key: string, changes: Partial<UploadEntry>) => {
    set((s) => {
      const entry = s.entries[key];
      return entry ? { entries: { ...s.entries, [key]: { ...entry, ...changes } } } : s;
    });
  };

  const run = async (key: string, picked: PickedFile, assetId?: string) => {
    const controller = new AbortController();
    controllers.set(key, controller);
    try {
      await runUpload({
        file: picked.file,
        api: uploadApi,
        putPart: xhrPutPart,
        signal: controller.signal,
        ...(assetId === undefined ? {} : { assetId }),
        onCreated: (plan) => {
          patch(key, { assetId: plan.assetId });
          const record: StoredUpload = {
            assetId: plan.assetId,
            name: picked.file.name,
            size: picked.file.size,
            lastModified: picked.file.lastModified,
            ...(picked.handle ? { handle: picked.handle } : {}),
          };
          void idbSet(storageKey(plan.assetId), record).catch(() => undefined);
          void useAssetsStore.getState().fetchOne(plan.assetId);
        },
        onProgress: (uploadedBytes) => {
          patch(key, { uploadedBytes });
        },
      });
      const id = get().entries[key]?.assetId;
      if (id) await del(storageKey(id)).catch(() => undefined);
      get().dismiss(key);
    } catch (error) {
      if (controller.signal.aborted) return;
      patch(key, {
        state: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      controllers.delete(key);
    }
  };

  return {
    entries: {},

    start(files) {
      for (const picked of files) {
        localKeys += 1;
        const key = `local-${String(localKeys)}`;
        set((s) => ({
          entries: {
            ...s.entries,
            [key]: {
              key,
              assetId: null,
              name: picked.file.name,
              size: picked.file.size,
              uploadedBytes: 0,
              state: "uploading",
              error: null,
            },
          },
        }));
        void run(key, picked);
      }
    },

    async resume(assetId, pick) {
      const asset = useAssetsStore.getState().byId[assetId];
      const stored = await idbGet<StoredUpload>(storageKey(assetId)).catch(() => undefined);
      const name = stored?.name ?? asset?.name ?? "the original file";
      let picked: PickedFile | null = null;
      if (stored?.handle) {
        const file = await fileFromHandle(stored.handle);
        if (file) picked = { file, handle: stored.handle };
      }
      picked ??= await pick(name);
      if (picked === null) return null; // user cancelled the picker
      const expectedSize = stored?.size ?? asset?.sizeBytes;
      if (expectedSize !== undefined && picked.file.size !== expectedSize) {
        return `That isn't the same file: "${name}" is ${String(expectedSize)} bytes. Choose the original file.`;
      }
      const key = `resume-${assetId}`;
      set((s) => ({
        entries: {
          ...s.entries,
          [key]: {
            key,
            assetId,
            name: picked.file.name,
            size: picked.file.size,
            uploadedBytes: 0,
            state: "uploading",
            error: null,
          },
        },
      }));
      void run(key, picked, assetId);
      return null;
    },

    async cancel(key) {
      const entry = get().entries[key];
      controllers.get(key)?.abort();
      get().dismiss(key);
      const assetId = entry?.assetId ?? (key.startsWith("resume-") ? key.slice(7) : null);
      if (assetId) {
        await del(storageKey(assetId)).catch(() => undefined);
        await useAssetsStore.getState().remove(assetId);
      }
    },

    dismiss(key) {
      set((s) => {
        const { [key]: _gone, ...rest } = s.entries;
        return { entries: rest };
      });
    },
  };
});

/** Active upload entry for an asset, if this tab is uploading it. */
export function entryForAsset(
  entries: Record<string, UploadEntry>,
  assetId: string,
): UploadEntry | undefined {
  return Object.values(entries).find((e) => e.assetId === assetId);
}
