import { ALL_FORMATS, Input, UrlSource, VideoSampleSink } from "mediabunny";
import { MediaError, type MediaResolver } from "./media.ts";

export interface VideoMedia {
  assetId: string;
  url: string;
  input: Input;
  sink: VideoSampleSink;
  /** Display size (rotation applied). The M1 proxies are already upright. */
  width: number;
  height: number;
  /** Timestamp of the first frame; frame 0 is shown at this time. */
  firstTimestamp: number;
}

/** Opens each asset's video once and shares the demuxer between all clips that use it. */
export class MediaRegistry {
  readonly #resolver: MediaResolver;
  readonly #videos = new Map<string, Promise<VideoMedia>>();

  constructor(resolver: MediaResolver) {
    this.#resolver = resolver;
  }

  video(assetId: string): Promise<VideoMedia> {
    let pending = this.#videos.get(assetId);
    if (pending === undefined) {
      pending = this.#open(assetId);
      this.#videos.set(assetId, pending);
      // A failed open must not be cached: the next request retries (e.g. with a fresh URL).
      pending.catch(() => {
        if (this.#videos.get(assetId) === pending) this.#videos.delete(assetId);
      });
    }
    return pending;
  }

  async #open(assetId: string): Promise<VideoMedia> {
    const url = await this.#resolver.resolve(assetId, "video");
    const input = new Input({ formats: ALL_FORMATS, source: new UrlSource(url) });
    try {
      const track = await input.getPrimaryVideoTrack();
      if (track === null) throw new MediaError(assetId, "the file has no video track");
      if (!(await track.canDecode())) {
        const codec = String(await track.getCodec());
        throw new MediaError(assetId, `this browser can't decode the video (${codec})`);
      }
      if ((await track.getRotation()) !== 0) {
        throw new MediaError(assetId, "rotated video is not supported (proxies are upright)");
      }
      return {
        assetId,
        url,
        input,
        sink: new VideoSampleSink(track),
        width: await track.getDisplayWidth(),
        height: await track.getDisplayHeight(),
        firstTimestamp: await track.getFirstTimestamp(),
      };
    } catch (error) {
      input.dispose();
      if (error instanceof MediaError) throw error;
      throw new MediaError(assetId, `couldn't open the video: ${String(error)}`, { cause: error });
    }
  }

  /** Forget an asset (its URL changed or expired); the next request reopens it. */
  async invalidate(assetId: string): Promise<void> {
    const pending = this.#videos.get(assetId);
    this.#videos.delete(assetId);
    if (pending !== undefined) (await pending.catch(() => null))?.input.dispose();
  }

  async dispose(): Promise<void> {
    const all = [...this.#videos.values()];
    this.#videos.clear();
    for (const pending of all) (await pending.catch(() => null))?.input.dispose();
  }
}
