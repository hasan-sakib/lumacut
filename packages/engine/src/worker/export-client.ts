import type { MediaResolver } from "../decode/media.ts";
import type { VideoExportJob, VideoExportResult } from "../export/video.ts";
import { Rpc } from "./rpc.ts";

/**
 * Exports a video in a Web Worker of its own (the preview keeps running). The page answers the
 * worker's media URL requests; the mix is rendered on the page beforehand (offline audio only
 * exists there) and handed over in `job.audio`.
 */
export class VideoExportClient {
  readonly #worker: Worker;
  readonly #rpc: Rpc;

  constructor(resolver: MediaResolver, worker?: Worker) {
    this.#worker =
      worker ?? new Worker(new URL("./export.worker.ts", import.meta.url), { type: "module" });
    this.#rpc = new Rpc(this.#worker, {
      resolveMedia: async (payload: {
        assetId: string;
        kind: Parameters<MediaResolver["resolve"]>[1];
      }) => ({ result: await resolver.resolve(payload.assetId, payload.kind) }),
    });
  }

  /** Runs the export; `onProgress` gets frames done / total. The mix's buffers are transferred. */
  run(
    job: VideoExportJob,
    onProgress: (done: number, total: number) => void,
  ): Promise<VideoExportResult> {
    const off = this.#rpc.on("progress", (p: { done: number; total: number }) => {
      onProgress(p.done, p.total);
    });
    const transfer = job.audio?.channels.map((c) => c.buffer) ?? [];
    return this.#rpc
      .call<VideoExportResult>("exportVideo", job, transfer as Transferable[])
      .finally(off);
  }

  cancel(): void {
    void this.#rpc.call("cancel");
  }

  dispose(): void {
    this.#rpc.dispose();
    this.#worker.terminate();
  }
}
