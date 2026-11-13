import type { MediaKind, MediaResolver } from "../decode/media.ts";
import { exportVideo, type VideoExportJob } from "../export/video.ts";
import { Rpc, type PortLike } from "./rpc.ts";

/** Runs inside the export worker: one video export at a time, media URLs asked from the page. */
export class ExportHost {
  readonly #rpc: Rpc;
  #cancelled = false;

  constructor(port: PortLike) {
    this.#rpc = new Rpc(port, {
      exportVideo: async (job: VideoExportJob) => {
        this.#cancelled = false;
        const resolver: MediaResolver = {
          resolve: (assetId: string, kind: MediaKind) =>
            this.#rpc.call<string>("resolveMedia", { assetId, kind }),
        };
        const result = await exportVideo(
          job,
          resolver,
          (done, total) => {
            this.#rpc.notify("progress", { done, total });
          },
          () => this.#cancelled,
        );
        return { result, transfer: [result.data] };
      },
      cancel: () => {
        this.#cancelled = true;
        return undefined;
      },
    });
  }
}
