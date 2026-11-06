import type { Rational } from "@lumacut/schema";
import { FrameReader } from "../decode/frame-reader.ts";
import type { VideoMedia } from "../decode/media-registry.ts";
import type { EngineStats } from "../stats.ts";

/**
 * One FrameReader per active clip (each keeps its own decoder position), capped so we never hold
 * more hardware decoders than the browser allows. Least recently used readers are closed first.
 */
export class ReaderPool {
  readonly #max: number;
  readonly #stats: EngineStats;
  /** Insertion order is recency. */
  readonly #readers = new Map<string, { reader: FrameReader; assetId: string }>();

  constructor(max: number, stats: EngineStats) {
    this.#max = max;
    this.#stats = stats;
  }

  get size(): number {
    return this.#readers.size;
  }

  acquire(clipId: string, media: VideoMedia, fps: Rational): FrameReader {
    const existing = this.#readers.get(clipId);
    if (existing?.assetId === media.assetId) {
      this.#readers.delete(clipId);
      this.#readers.set(clipId, existing);
      return existing.reader;
    }
    if (existing !== undefined) void existing.reader.close();
    const reader = new FrameReader(media, fps, this.#stats);
    this.#readers.delete(clipId);
    this.#readers.set(clipId, { reader, assetId: media.assetId });
    return reader;
  }

  /** Closes least recently used readers beyond the cap, never one in `keep`. */
  async trim(keep: ReadonlySet<string>): Promise<void> {
    for (const [clipId, entry] of [...this.#readers]) {
      if (this.#readers.size <= this.#max) return;
      if (keep.has(clipId)) continue;
      this.#readers.delete(clipId);
      await entry.reader.close();
    }
  }

  async dispose(): Promise<void> {
    const all = [...this.#readers.values()];
    this.#readers.clear();
    for (const { reader } of all) await reader.close();
  }
}
