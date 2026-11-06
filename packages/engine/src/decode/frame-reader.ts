import type { VideoSample } from "mediabunny";
import type { Rational } from "@lumacut/schema";
import { frameCenterSeconds } from "../timeline/frames.ts";
import type { EngineStats } from "../stats.ts";
import { MediaError } from "./media.ts";
import type { VideoMedia } from "./media-registry.ts";
import { TrackedFrame } from "./tracked-frame.ts";

/** A forward gap up to this many frames is cheaper to decode through than to seek over. */
export const MAX_FORWARD_SKIP = 8;

type SampleIterator = AsyncGenerator<VideoSample, void, unknown>;

/**
 * Reads frames of one clip's media by index. Two access paths, chosen by the access pattern:
 *
 * - **Sequential** (playback): after two consecutive frames, one decoder iterator is kept open
 *   and just pulled forward (about 3 ms per 720p frame), skipping small gaps.
 * - **Random** (scrub, seek, reverse): a one-shot lookup that decodes from the previous keyframe
 *   (at most one 0.5 s GOP of an M1 proxy).
 *
 * Frames are requested by index and looked up at the *centre* of the frame interval. The caller
 * owns every returned `TrackedFrame` and must `close()` it.
 */
export class FrameReader {
  readonly #media: VideoMedia;
  readonly #fps: Rational;
  readonly #stats: EngineStats;
  #iterator: SampleIterator | null = null;
  /** Index of the frame the iterator yields next (only meaningful while it is open). */
  #cursor = 0;
  #lastReturned = -2;

  constructor(media: VideoMedia, fps: Rational, stats: EngineStats) {
    this.#media = media;
    this.#fps = fps;
    this.#stats = stats;
  }

  get hasOpenIterator(): boolean {
    return this.#iterator !== null;
  }

  #timestamp(frame: number): number {
    return this.#media.firstTimestamp + frameCenterSeconds(frame, this.#fps);
  }

  #indexOf(sample: VideoSample): number {
    return Math.round(
      ((sample.timestamp - this.#media.firstTimestamp) * this.#fps.num) / this.#fps.den,
    );
  }

  async frame(index: number): Promise<TrackedFrame> {
    const forward =
      this.#iterator !== null && index >= this.#cursor && index - this.#cursor <= MAX_FORWARD_SKIP;
    if (forward) return this.#pull(index);

    await this.#closeIterator();
    if (index === this.#lastReturned + 1) {
      // Second consecutive frame: this is playback, so keep a decoder open from here on.
      this.#openIterator(index);
      return this.#pull(index);
    }
    return this.#seek(index);
  }

  async #seek(index: number): Promise<TrackedFrame> {
    this.#stats.seeks += 1;
    const sample = await this.#media.sink.getSample(this.#timestamp(index));
    if (sample === null) throw new MediaError(this.#media.assetId, `no frame ${String(index)}`);
    return this.#deliver(sample, index);
  }

  #openIterator(index: number): void {
    this.#iterator = this.#media.sink.samples(this.#timestamp(index));
    this.#cursor = index;
    this.#stats.iteratorsOpened += 1;
  }

  async #pull(index: number): Promise<TrackedFrame> {
    const iterator = this.#iterator;
    if (iterator === null) throw new Error("FrameReader: no open iterator");
    for (;;) {
      const next = await iterator.next();
      if (next.done === true) {
        await this.#closeIterator();
        throw new MediaError(this.#media.assetId, `the video ends before frame ${String(index)}`);
      }
      const found = this.#indexOf(next.value);
      this.#cursor = found + 1;
      if (found < index) {
        next.value.close();
        this.#stats.skippedFrames += 1;
        continue;
      }
      if (found > index) {
        next.value.close();
        await this.#closeIterator();
        throw new MediaError(
          this.#media.assetId,
          `expected frame ${String(index)} but the decoder produced ${String(found)}`,
        );
      }
      this.#stats.sequentialReads += 1;
      return this.#deliver(next.value, found);
    }
  }

  #deliver(sample: VideoSample, index: number): TrackedFrame {
    const found = this.#indexOf(sample);
    if (found !== index) {
      sample.close();
      throw new MediaError(
        this.#media.assetId,
        `expected frame ${String(index)} but the decoder produced ${String(found)}`,
      );
    }
    this.#lastReturned = index;
    return new TrackedFrame(sample, index, this.#stats);
  }

  async #closeIterator(): Promise<void> {
    const iterator = this.#iterator;
    if (iterator === null) return;
    this.#iterator = null;
    this.#stats.iteratorsClosed += 1;
    await iterator.return();
  }

  /** Releases the decoder. The reader can be used again afterwards. */
  async close(): Promise<void> {
    await this.#closeIterator();
    this.#lastReturned = -2;
  }
}
