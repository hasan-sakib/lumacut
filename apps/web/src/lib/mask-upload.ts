import { api, errorMessage, type AssetOut } from "../api/client.ts";
import { xhrPutPart, runUpload } from "./uploader.ts";
import { uploadApi } from "../stores/uploads.ts";
import { useAssetsStore } from "../stores/assets.ts";

const POLL_MS = 600;
const GIVE_UP_MS = 90_000;

/**
 * Saves a picture (a painted mask) as a library image and waits until the server has processed it,
 * so a project can refer to it. The upload is the ordinary one: the image shows up in the library.
 */
export async function uploadPicture(blob: Blob, name: string): Promise<AssetOut> {
  const file = Object.assign(blob, { name });
  let assetId = "";
  await runUpload({
    file,
    api: uploadApi,
    putPart: xhrPutPart,
    signal: new AbortController().signal,
    onCreated: (plan) => {
      assetId = plan.assetId;
      void useAssetsStore.getState().fetchOne(plan.assetId);
    },
  });
  const started = Date.now();
  for (;;) {
    const { data, error } = await api.GET("/api/assets/{asset_id}", {
      params: { path: { asset_id: assetId } },
    });
    if (data === undefined) throw new Error(errorMessage(error, "Couldn't check the saved mask."));
    if (data.status === "ready") return data;
    if (data.status === "failed") {
      throw new Error(data.errorMessage ?? "The server couldn't process the saved mask.");
    }
    if (Date.now() - started > GIVE_UP_MS) throw new Error("Saving the mask took too long.");
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}
