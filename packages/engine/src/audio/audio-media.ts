import { ALL_FORMATS, AudioBufferSink, Input, UrlSource } from "mediabunny";
import { MediaError, type MediaResolver } from "../decode/media.ts";

export interface AudioMedia {
  assetId: string;
  input: Input;
  sink: AudioBufferSink;
}

/** Opens each asset's audio track once (video proxies carry their audio in the same file). */
export class AudioRegistry {
  readonly #resolver: MediaResolver;
  readonly #audio = new Map<string, Promise<AudioMedia>>();
  readonly #preferOriginal: boolean;

  /** With `preferOriginal` (exports) the uploaded file's sound is read, falling back to the proxy. */
  constructor(resolver: MediaResolver, preferOriginal = false) {
    this.#resolver = resolver;
    this.#preferOriginal = preferOriginal;
  }

  audio(assetId: string): Promise<AudioMedia> {
    let pending = this.#audio.get(assetId);
    if (pending === undefined) {
      pending = this.#open(assetId);
      this.#audio.set(assetId, pending);
      pending.catch(() => {
        if (this.#audio.get(assetId) === pending) this.#audio.delete(assetId);
      });
    }
    return pending;
  }

  async #open(assetId: string): Promise<AudioMedia> {
    if (this.#preferOriginal) {
      try {
        return await this.#openKind(assetId, "original");
      } catch {
        // The original can't be read here: the audio proxy is.
      }
    }
    return this.#openKind(assetId, "audio");
  }

  async #openKind(assetId: string, kind: "audio" | "original"): Promise<AudioMedia> {
    const url = await this.#resolver.resolve(assetId, kind);
    const input = new Input({ formats: ALL_FORMATS, source: new UrlSource(url) });
    try {
      const track = await input.getPrimaryAudioTrack();
      if (track === null) throw new MediaError(assetId, "the file has no audio track");
      if (!(await track.canDecode())) {
        const codec = String(await track.getCodec());
        throw new MediaError(assetId, `this browser can't decode the audio (${codec})`);
      }
      return { assetId, input, sink: new AudioBufferSink(track) };
    } catch (error) {
      input.dispose();
      if (error instanceof MediaError) throw error;
      throw new MediaError(assetId, `couldn't open the audio: ${String(error)}`, { cause: error });
    }
  }

  async dispose(): Promise<void> {
    const all = [...this.#audio.values()];
    this.#audio.clear();
    for (const pending of all) (await pending.catch(() => null))?.input.dispose();
  }
}
