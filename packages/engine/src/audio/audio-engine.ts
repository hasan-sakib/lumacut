import type { Asset, Clip, Composition, Project } from "@lumacut/schema";
import type { MediaResolver } from "../decode/media.ts";
import type { Diagnostic } from "../render/diagnostics.ts";
import { clipDurationUs } from "../timeline/source-time.ts";
import { AudioRegistry } from "./audio-media.ts";

type BufferIterator = AsyncGenerator<
  { buffer: AudioBuffer; timestamp: number; duration: number },
  void,
  unknown
>;

export interface AudioStats {
  iteratorsOpened: number;
  iteratorsClosed: number;
  sourcesScheduled: number;
  sourcesActive: number;
}

export interface AudioEngineOptions {
  context: BaseAudioContext;
  resolver: MediaResolver;
  /** Where the mix goes; defaults to the context's destination. */
  destination?: AudioNode;
  /** How far ahead `start` schedules before returning (µs). */
  lookaheadUs?: number;
}

/** One audible clip: its window on the timeline and in the source, and its audio nodes. */
interface ClipPlan {
  clipId: string;
  assetId: string;
  startS: number;
  endS: number;
  inS: number;
  outS: number;
  /** First source instant to play: later than `inS` when playback starts inside the clip. */
  fromSourceS: number;
  gain: GainNode;
  pan: StereoPannerNode;
  iterator: BufferIterator | null;
  scheduledToS: number;
  done: boolean;
  sources: Set<AudioBufferSourceNode>;
}

const DEFAULT_LOOKAHEAD_US = 1_000_000;
const US = 1_000_000;

/**
 * Plays the audio of a composition's audio tracks. Decoded audio is scheduled as Web Audio
 * sources against a context time, so the sound sample-accurately follows the audio clock that
 * also drives the picture. Takes any `BaseAudioContext`: live playback uses an `AudioContext`,
 * tests render the very same schedule with an `OfflineAudioContext`.
 *
 * Audio fades, keyframed volume, effects, speed changes and reverse come with the mixer (M7) and
 * are reported as diagnostics, never ignored silently.
 */
export class AudioEngine {
  readonly stats: AudioStats = {
    iteratorsOpened: 0,
    iteratorsClosed: 0,
    sourcesScheduled: 0,
    sourcesActive: 0,
  };
  readonly #context: BaseAudioContext;
  readonly #registry: AudioRegistry;
  readonly #master: GainNode;
  readonly #lookaheadUs: number;
  #project: Project | null = null;
  #assets = new Map<string, Asset>();
  #plans: ClipPlan[] = [];
  #origin = { timelineS: 0, contextTime: 0 };
  #generation = 0;
  #chain: Promise<void> = Promise.resolve();
  #diagnostics: Diagnostic[] = [];

  constructor(options: AudioEngineOptions) {
    this.#context = options.context;
    this.#registry = new AudioRegistry(options.resolver);
    this.#lookaheadUs = options.lookaheadUs ?? DEFAULT_LOOKAHEAD_US;
    this.#master = options.context.createGain();
    this.#master.connect(options.destination ?? options.context.destination);
  }

  get diagnostics(): readonly Diagnostic[] {
    return this.#diagnostics;
  }

  setProject(project: Project): void {
    this.#project = project;
    this.#assets = new Map(project.assets.map((a) => [a.id, a]));
  }

  /**
   * Starts playing `compositionId` from timeline time `fromUs`, with that instant sounding at
   * context time `contextStartTime`. Schedules the first look-ahead window before returning.
   */
  async start(compositionId: string, fromUs: number, contextStartTime: number): Promise<void> {
    await this.stop();
    const composition = this.#project?.compositions.find((c) => c.id === compositionId);
    if (composition === undefined) throw new Error(`Unknown composition "${compositionId}"`);
    this.#generation += 1;
    this.#diagnostics = [];
    this.#origin = { timelineS: fromUs / US, contextTime: contextStartTime };
    this.#plans = this.#plan(composition, fromUs);
    await this.scheduleUntil(fromUs + this.#lookaheadUs);
  }

  /** Schedules decoded audio up to timeline time `untilUs`. Calls run one at a time. */
  scheduleUntil(untilUs: number): Promise<void> {
    const run = this.#chain.then(() => this.#schedule(untilUs));
    this.#chain = run.catch(() => undefined);
    return run;
  }

  /** Silences and releases everything scheduled so far. */
  async stop(): Promise<void> {
    this.#generation += 1;
    const plans = this.#plans;
    this.#plans = [];
    const closing: Promise<void>[] = [];
    for (const plan of plans) {
      for (const node of [...plan.sources]) {
        plan.sources.delete(node);
        this.stats.sourcesActive -= 1;
        node.onended = null;
        try {
          node.stop();
        } catch {
          // Already ended or never started.
        }
        node.disconnect();
      }
      plan.gain.disconnect();
      plan.pan.disconnect();
      closing.push(this.#closeIterator(plan));
    }
    await Promise.all(closing);
  }

  async dispose(): Promise<void> {
    await this.stop();
    await this.#chain;
    this.#master.disconnect();
    await this.#registry.dispose();
  }

  #warn(clip: Clip, code: string, message: string): void {
    this.#diagnostics.push({ clipId: clip.id, level: "warning", code, message });
  }

  #plan(composition: Composition, fromUs: number): ClipPlan[] {
    const plans: ClipPlan[] = [];
    const anySolo = composition.tracks.some((t) => t.kind === "audio" && t.solo);
    for (const track of composition.tracks) {
      if (track.kind !== "audio" || track.muted || (anySolo && !track.solo)) continue;
      for (const clip of track.clips) {
        const plan = this.#planClip(clip, fromUs);
        if (plan !== null) plans.push(plan);
      }
    }
    return plans;
  }

  #planClip(clip: Clip, fromUs: number): ClipPlan | null {
    const endUs = clip.startUs + clipDurationUs(clip);
    if (endUs <= fromUs) return null; // already over when playback starts
    const fail = (code: string, message: string): null => {
      this.#diagnostics.push({ clipId: clip.id, level: "error", code, message });
      return null;
    };
    if (clip.type !== "media" || clip.assetId === undefined) {
      return fail("not_audio", `${clip.type} clips on an audio track make no sound.`);
    }
    const asset = this.#assets.get(clip.assetId);
    if (asset === undefined)
      return fail("missing_asset", `Asset ${clip.assetId} isn't in the project.`);
    if (asset.audio === undefined)
      return fail("no_audio_stream", `Asset ${asset.id} has no audio.`);
    if (clip.speed !== 1)
      return fail(
        "audio_speed_unsupported",
        "Audio at a speed other than 1 comes with the mixer (M7); the clip is silent.",
      );
    if (clip.reversed)
      return fail(
        "audio_reverse_unsupported",
        "Reversed audio comes with the mixer (M7); the clip is silent.",
      );
    if (clip.freezeAtUs !== undefined)
      return fail("audio_freeze_silent", "A freeze frame has no sound.");

    const audio = clip.audio;
    if (audio !== undefined && (audio.fadeInUs > 0 || audio.fadeOutUs > 0)) {
      this.#warn(clip, "ignored_audio_fades", "Audio fades aren't applied yet (M7).");
    }
    if (audio?.effects.some((e) => e.enabled) === true) {
      this.#warn(clip, "ignored_audio_effects", "Audio effects aren't applied yet (M7).");
    }
    if (Object.keys(clip.keyframes).some((p) => p.startsWith("audio."))) {
      this.#warn(clip, "ignored_keyframes", "Keyframed volume isn't applied yet (M7).");
    }

    const gain = this.#context.createGain();
    gain.gain.value = audio?.volume ?? 1;
    const pan = this.#context.createStereoPanner();
    pan.pan.value = audio?.pan ?? 0;
    gain.connect(pan);
    pan.connect(this.#master);

    const startS = clip.startUs / US;
    const inS = clip.inUs / US;
    const playedFromS = Math.max(0, this.#origin.timelineS - startS);
    return {
      clipId: clip.id,
      assetId: asset.id,
      startS,
      endS: endUs / US,
      inS,
      outS: clip.outUs / US,
      fromSourceS: inS + playedFromS,
      gain,
      pan,
      iterator: null,
      scheduledToS: inS + playedFromS,
      done: false,
      sources: new Set(),
    };
  }

  async #schedule(untilUs: number): Promise<void> {
    const generation = this.#generation;
    await Promise.all(this.#plans.map((plan) => this.#pump(plan, untilUs / US, generation)));
  }

  async #pump(plan: ClipPlan, untilS: number, generation: number): Promise<void> {
    if (plan.done || plan.startS >= untilS) return;
    const target = plan.inS + (Math.min(untilS, plan.endS) - plan.startS);
    try {
      if (plan.iterator === null) {
        const media = await this.#registry.audio(plan.assetId);
        if (generation !== this.#generation) return;
        plan.iterator = media.sink.buffers(plan.fromSourceS);
        this.stats.iteratorsOpened += 1;
      }
      while (plan.scheduledToS < target) {
        const next = await plan.iterator.next();
        if (generation !== this.#generation) return;
        if (next.done === true) {
          plan.done = true;
          await this.#closeIterator(plan);
          return;
        }
        const { buffer, timestamp } = next.value;
        this.#scheduleBuffer(plan, buffer, timestamp);
        plan.scheduledToS = timestamp + buffer.duration;
        if (plan.scheduledToS >= plan.outS) {
          plan.done = true;
          await this.#closeIterator(plan);
          return;
        }
      }
    } catch (error) {
      if (generation !== this.#generation) return;
      plan.done = true;
      this.#diagnostics.push({
        clipId: plan.clipId,
        level: "error",
        code: "audio_error",
        message: error instanceof Error ? error.message : String(error),
      });
      await this.#closeIterator(plan);
    }
  }

  #scheduleBuffer(plan: ClipPlan, buffer: AudioBuffer, bufferStartS: number): void {
    const from = Math.max(bufferStartS, plan.inS, plan.fromSourceS);
    const to = Math.min(bufferStartS + buffer.duration, plan.outS);
    if (to <= from) return;
    let when =
      this.#origin.contextTime + (plan.startS + (from - plan.inS) - this.#origin.timelineS);
    let offset = from - bufferStartS;
    let duration = to - from;
    // Decoded late (the context time already passed): skip the part that should have played.
    const now = this.#context.currentTime;
    if (when < now) {
      const skip = now - when;
      if (skip >= duration) return;
      offset += skip;
      duration -= skip;
      when = now;
    }
    const node = this.#context.createBufferSource();
    node.buffer = buffer;
    node.connect(plan.gain);
    node.onended = () => {
      if (plan.sources.delete(node)) {
        this.stats.sourcesActive -= 1;
        node.disconnect();
      }
    };
    plan.sources.add(node);
    this.stats.sourcesScheduled += 1;
    this.stats.sourcesActive += 1;
    node.start(when, offset, duration);
  }

  async #closeIterator(plan: ClipPlan): Promise<void> {
    const iterator = plan.iterator;
    if (iterator === null) return;
    plan.iterator = null;
    this.stats.iteratorsClosed += 1;
    await iterator.return();
  }
}
