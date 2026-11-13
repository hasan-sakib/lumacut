import {
  Params,
  audioEffectById,
  type AudioEffectDefinition,
  type SampleProcessor,
} from "@lumacut/effects";
import { evaluate } from "@lumacut/ops";
import type { Asset, Clip, Composition, Project, Track } from "@lumacut/schema";
import type { MediaResolver } from "../decode/media.ts";
import type { Diagnostic } from "../render/diagnostics.ts";
import { clipDurationUs } from "../timeline/source-time.ts";
import { AudioRegistry } from "./audio-media.ts";
import { reverseChannels } from "./dsp/reverse.ts";
import { TimeStretcher } from "./dsp/stretch.ts";
import { LoudnessAccumulator, kWeighting } from "./loudness.ts";

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
  /** Make level meters (live playback); offline mixdown doesn't need them. Default true. */
  meters?: boolean;
  /** `original` (exports) reads the uploaded files' sound, falling back to proxies. */
  media?: "proxy" | "original";
}

/** A level reading, in dBFS (−∞ for silence). */
export interface Level {
  peak: number;
  rms: number;
}

export interface MeterReading {
  /** Per audio track of the composition being played. */
  tracks: Record<string, Level>;
  master: { left: Level; right: Level };
  /** Live loudness of the master while playing (LUFS; an approximation, see docs/audio.md). */
  loudness: { momentary: number; shortTerm: number; integrated: number };
}

/** A gain + pan stage with an optional level tap: track buses, the master, nested-clip buses. */
interface Bus {
  input: GainNode;
  pan: StereoPannerNode;
  analyser: AnalyserNode | null;
}

/** How a clip inside nested compositions maps to the top-level timeline. */
interface Placement {
  /** Add to top-level time to get time in the clip's own composition (µs). */
  offsetUs: number;
  /** The part of the top-level timeline the clip can sound in (nesting clips limit it). */
  windowStartUs: number;
  windowEndUs: number;
  /** Where the clip's sound goes. */
  bus: Bus;
}

/** One audible clip: its window on the timeline and in the source, and its audio nodes. */
interface ClipPlan {
  clipId: string;
  assetId: string;
  /** Top-level timeline seconds the clip sounds in. */
  startS: number;
  endS: number;
  /** Source window (seconds). */
  inS: number;
  outS: number;
  speed: number;
  /** Speed by resampling (pitch follows) instead of time-stretching. */
  rate: number;
  reversed: boolean;
  /** First source instant to play (reversed: the last one, playing backwards). */
  fromSourceS: number;
  /** Timeline second where the next piece of sound goes. */
  cursorS: number;
  stretcher: TimeStretcher | null;
  processors: SampleProcessor[];
  /** Channel layout of the processors' state (they are made on the first buffer). */
  pending: AudioEffectDefinition[];
  pendingParams: Params[];
  entry: GainNode;
  nodes: AudioNode[];
  iterator: BufferIterator | null;
  /** Reversed clips: the whole range, decoded and reversed, served from here. */
  reversedChannels: Float32Array[] | null;
  reversedRate: number;
  /** Sample rate of the decoded sound the processors run at. */
  sourceRate: number;
  done: boolean;
  sources: Set<AudioBufferSourceNode>;
}

const DEFAULT_LOOKAHEAD_US = 1_000_000;
const US = 1_000_000;
/** Longest clip that can be reversed (its whole range is decoded into memory). */
const MAX_REVERSE_S = 600;
/** Resolution of volume / pan automation curves. */
const CURVE_HZ = 100;
const NEG_INF = Number.NEGATIVE_INFINITY;

const toDb = (linear: number): number => (linear <= 0 ? NEG_INF : 20 * Math.log10(linear));

/**
 * Plays the audio of a composition: its audio tracks and the audio inside nested compositions.
 * Decoded audio is scheduled as Web Audio sources against a context time, so the sound follows the
 * audio clock that also drives the picture. Takes any `BaseAudioContext`: live playback uses an
 * `AudioContext`, mixdown renders the very same graph with an `OfflineAudioContext`.
 *
 * Per clip: sample processors (time-stretch, reverse, noise gate) run on the decoded samples, then
 * the clip's effects (native Web Audio nodes), its volume and pan (keyframed, with fades) and the
 * track's fader and pan, into the master fader.
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
  readonly #withMeters: boolean;
  readonly #masterTaps: { left: AnalyserNode; right: AnalyserNode } | null = null;
  readonly #loudnessTaps: { left: AnalyserNode; right: AnalyserNode } | null = null;
  readonly #loudness = new LoudnessAccumulator();
  #loudnessClock = { time: -1, energy: 0, samples: 0 };
  #project: Project | null = null;
  #assets = new Map<string, Asset>();
  #plans: ClipPlan[] = [];
  #buses: Bus[] = [];
  #trackBuses = new Map<string, Bus>();
  #origin = { timelineS: 0, contextTime: 0 };
  #generation = 0;
  #playing = false;
  #chain: Promise<void> = Promise.resolve();
  #diagnostics: Diagnostic[] = [];

  constructor(options: AudioEngineOptions) {
    this.#context = options.context;
    this.#registry = new AudioRegistry(options.resolver, options.media === "original");
    this.#lookaheadUs = options.lookaheadUs ?? DEFAULT_LOOKAHEAD_US;
    this.#withMeters = options.meters ?? true;
    this.#master = options.context.createGain();
    this.#master.connect(options.destination ?? options.context.destination);
    if (this.#withMeters) {
      const context = options.context;
      const split = context.createChannelSplitter(2);
      this.#master.connect(split);
      const tap = (channel: number, after?: AudioNode) => {
        const analyser = context.createAnalyser();
        analyser.fftSize = 8192;
        if (after === undefined) split.connect(analyser, channel);
        else after.connect(analyser);
        return analyser;
      };
      this.#masterTaps = { left: tap(0), right: tap(1) };
      // Loudness: each channel through the BS.1770 K-weighting filters, exactly.
      const weighted = (channel: number) => {
        const [shelf, highpass] = kWeighting(context.sampleRate);
        const a = context.createIIRFilter(shelf.b, shelf.a);
        const b = context.createIIRFilter(highpass.b, highpass.a);
        split.connect(a, channel);
        a.connect(b);
        return tap(channel, b);
      };
      this.#loudnessTaps = { left: weighted(0), right: weighted(1) };
    }
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
    this.#master.gain.value = composition.audio?.volume ?? 1;
    this.#plans = this.#plan(composition, fromUs);
    this.#playing = true;
    this.#loudnessClock = { time: -1, energy: 0, samples: 0 };
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
    this.#playing = false;
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
      plan.entry.disconnect();
      for (const node of plan.nodes) node.disconnect();
      closing.push(this.#closeIterator(plan));
    }
    for (const bus of this.#buses) {
      bus.input.disconnect();
      bus.pan.disconnect();
      bus.analyser?.disconnect();
    }
    this.#buses = [];
    this.#trackBuses = new Map();
    await Promise.all(closing);
  }

  async dispose(): Promise<void> {
    await this.stop();
    await this.#chain;
    this.#master.disconnect();
    await this.#registry.dispose();
  }

  /**
   * Changes a track's fader and pan (or the master's, with `trackId` null) on the sound that is
   * playing, without restarting it: the mixer moves these while a fader is dragged, then saves the
   * value in the project.
   */
  previewLevel(trackId: string | null, volume: number, pan = 0): void {
    const now = this.#context.currentTime;
    if (trackId === null) {
      this.#master.gain.setTargetAtTime(volume, now, 0.01);
      return;
    }
    const bus = this.#trackBuses.get(trackId);
    if (bus === undefined) return;
    bus.input.gain.setTargetAtTime(volume, now, 0.01);
    bus.pan.pan.setTargetAtTime(pan, now, 0.01);
  }

  /** Forgets the live loudness measured so far (a new integrated reading starts). */
  resetLoudness(): void {
    this.#loudness.reset();
    this.#loudnessClock = { time: -1, energy: 0, samples: 0 };
  }

  /**
   * Current levels of every track and the master, and the master's running loudness. Call it a
   * few times a second while playing (each call also feeds the loudness meter).
   */
  meters(): MeterReading {
    const level = (analyser: AnalyserNode | null): Level => {
      if (analyser === null) return { peak: NEG_INF, rms: NEG_INF };
      const data = new Float32Array(Math.min(2048, analyser.fftSize));
      analyser.getFloatTimeDomainData(data);
      let peak = 0;
      let sum = 0;
      for (const v of data) {
        peak = Math.max(peak, Math.abs(v));
        sum += v * v;
      }
      return { peak: toDb(peak), rms: toDb(Math.sqrt(sum / data.length)) };
    };
    const tracks: Record<string, Level> = {};
    for (const [id, bus] of this.#trackBuses) tracks[id] = level(bus.analyser);
    this.#feedLoudness();
    return {
      tracks,
      master: {
        left: level(this.#masterTaps?.left ?? null),
        right: level(this.#masterTaps?.right ?? null),
      },
      loudness: {
        momentary: this.#loudness.momentary,
        shortTerm: this.#loudness.shortTerm,
        integrated: this.#loudness.integrated,
      },
    };
  }

  /** Adds the K-weighted master signal since the last call to the running loudness. */
  #feedLoudness(): void {
    const taps = this.#loudnessTaps;
    if (taps === null || !this.#playing) return;
    const now = this.#context.currentTime;
    const rate = this.#context.sampleRate;
    const clock = this.#loudnessClock;
    if (clock.time < 0) {
      clock.time = now;
      return;
    }
    const elapsed = Math.min(taps.left.fftSize, Math.round((now - clock.time) * rate));
    clock.time = now;
    if (elapsed <= 0) return;
    const left = new Float32Array(taps.left.fftSize);
    const right = new Float32Array(taps.right.fftSize);
    taps.left.getFloatTimeDomainData(left);
    taps.right.getFloatTimeDomainData(right);
    let energy = 0;
    for (let i = left.length - elapsed; i < left.length; i += 1) {
      const l = left[i] ?? 0;
      const r = right[i] ?? 0;
      energy += l * l + r * r;
    }
    clock.energy += energy;
    clock.samples += elapsed;
    const block = Math.round(rate / 10);
    while (clock.samples >= block) {
      // Spread what was read evenly over whole 100 ms pieces.
      const share = (clock.energy * block) / clock.samples;
      this.#loudness.add(share / block);
      clock.energy -= share;
      clock.samples -= block;
    }
  }

  #warn(clip: Clip, code: string, message: string): void {
    this.#diagnostics.push({ clipId: clip.id, level: "warning", code, message });
  }

  #bus(volume: number, pan: number, into: AudioNode, metered: boolean): Bus {
    const input = this.#context.createGain();
    input.gain.value = volume;
    const panner = this.#context.createStereoPanner();
    panner.pan.value = pan;
    input.connect(panner);
    panner.connect(into);
    let analyser: AnalyserNode | null = null;
    if (metered && this.#withMeters) {
      analyser = this.#context.createAnalyser();
      analyser.fftSize = 2048;
      panner.connect(analyser);
    }
    const bus = { input, pan: panner, analyser };
    this.#buses.push(bus);
    return bus;
  }

  #plan(composition: Composition, fromUs: number): ClipPlan[] {
    const plans: ClipPlan[] = [];
    this.#planComposition(
      composition,
      fromUs,
      { offsetUs: 0, windowStartUs: 0, windowEndUs: Number.POSITIVE_INFINITY, bus: null },
      plans,
      new Set([composition.id]),
    );
    return plans;
  }

  /** Plans every audible clip of a composition (recursing into nested compositions). */
  #planComposition(
    composition: Composition,
    fromUs: number,
    where: Omit<Placement, "bus"> & { bus: Bus | null },
    plans: ClipPlan[],
    seen: Set<string>,
  ): void {
    const top = where.bus === null;
    const audible = (track: Track) => {
      const anySolo = composition.tracks.some((t) => t.kind === track.kind && t.solo);
      return !track.muted && (!anySolo || track.solo);
    };
    for (const track of composition.tracks) {
      if (!audible(track)) continue;
      if (track.kind === "audio") {
        const into = where.bus?.input ?? this.#master;
        const bus = this.#bus(track.audio?.volume ?? 1, track.audio?.pan ?? 0, into, top);
        if (top) this.#trackBuses.set(track.id, bus);
        for (const clip of track.clips) {
          const plan = this.#planClip(clip, fromUs, { ...where, bus });
          if (plan !== null) plans.push(plan);
        }
      }
      // Nested compositions sound wherever they are (picture tracks included).
      for (const clip of track.clips) {
        if (clip.type !== "composition" || clip.compositionId === undefined) continue;
        this.#planNested(clip, fromUs, where, plans, seen);
      }
    }
  }

  #planNested(
    clip: Clip,
    fromUs: number,
    where: Omit<Placement, "bus"> & { bus: Bus | null },
    plans: ClipPlan[],
    seen: Set<string>,
  ): void {
    const child = this.#project?.compositions.find((c) => c.id === clip.compositionId);
    if (child === undefined || seen.has(child.id)) return;
    const hasAudio = child.tracks.some((t) => t.kind === "audio" && t.clips.length > 0);
    const nestedAudio =
      hasAudio || child.tracks.some((t) => t.clips.some((c) => c.type === "composition"));
    if (!nestedAudio) return;
    if (clip.speed !== 1 || clip.reversed || clip.freezeAtUs !== undefined) {
      this.#warn(
        clip,
        "nested_audio_unsupported",
        "The sound inside a nested composition plays only at normal speed, forwards; this clip is silent.",
      );
      return;
    }
    // Top-level window of this nested clip, and how its time maps into the child.
    const start = clip.startUs - where.offsetUs;
    const end = start + clipDurationUs(clip);
    const windowStartUs = Math.max(where.windowStartUs, start);
    const windowEndUs = Math.min(where.windowEndUs, end);
    if (windowEndUs <= Math.max(windowStartUs, fromUs)) return;
    const audio = clip.audio;
    const into = where.bus?.input ?? this.#master;
    const bus = this.#bus(audio?.volume ?? 1, audio?.pan ?? 0, into, false);
    this.#automate(bus, clip, where.offsetUs, windowStartUs, windowEndUs, fromUs);
    const next = new Set(seen);
    next.add(child.id);
    this.#planComposition(
      child,
      fromUs,
      {
        offsetUs: where.offsetUs + clip.inUs - clip.startUs,
        windowStartUs,
        windowEndUs,
        bus,
      },
      plans,
      next,
    );
  }

  /**
   * Volume and pan of a clip over its window as automation curves: keyframes (shared `evaluate`)
   * times equal-power fades. Constant values are set directly.
   */
  #automate(
    target: { input: GainNode; pan: StereoPannerNode },
    clip: Clip,
    offsetUs: number,
    windowStartUs: number,
    windowEndUs: number,
    fromUs: number,
  ): void {
    const audio = clip.audio;
    const fromS = Math.max(fromUs, windowStartUs) / US;
    const endS = windowEndUs / US;
    const clipStartS = (clip.startUs - offsetUs) / US;
    const clipEndS = clipStartS + clipDurationUs(clip) / US;
    const fadeIn = (audio?.fadeInUs ?? 0) / US;
    const fadeOut = (audio?.fadeOutUs ?? 0) / US;
    const keyed = (path: string) => (clip.keyframes[path]?.length ?? 0) > 0;
    const volumeKeyed = keyed("audio.volume");
    const panKeyed = keyed("audio.pan");
    const local = (s: number) => Math.round(s * US + offsetUs - clip.startUs);
    const volumeAt = (s: number): number => {
      let v = audio?.volume ?? 1;
      if (volumeKeyed) {
        const k = evaluate(clip, "audio.volume", local(s));
        if (typeof k === "number") v = k;
      }
      if (fadeIn > 0)
        v *= Math.sin((Math.PI / 2) * Math.min(1, Math.max(0, (s - clipStartS) / fadeIn)));
      if (fadeOut > 0)
        v *= Math.sin((Math.PI / 2) * Math.min(1, Math.max(0, (clipEndS - s) / fadeOut)));
      return v;
    };
    const when = (s: number) => this.#origin.contextTime + (s - this.#origin.timelineS);
    const span = endS - fromS;
    const curve = (fn: (s: number) => number): Float32Array => {
      const n = Math.max(2, Math.ceil(span * CURVE_HZ) + 1);
      const values = new Float32Array(n);
      for (let i = 0; i < n; i += 1) values[i] = fn(fromS + (span * i) / (n - 1));
      return values;
    };
    const start = Math.max(when(fromS), this.#context.currentTime);
    if (span > 0 && (volumeKeyed || fadeIn > 0 || fadeOut > 0)) {
      target.input.gain.value = volumeAt(fromS);
      target.input.gain.setValueCurveAtTime(curve(volumeAt), start, span);
    } else {
      target.input.gain.value = audio?.volume ?? 1;
    }
    if (span > 0 && panKeyed) {
      const panAt = (s: number) => {
        const k = evaluate(clip, "audio.pan", local(s));
        return typeof k === "number" ? Math.max(-1, Math.min(1, k)) : (audio?.pan ?? 0);
      };
      target.pan.pan.value = panAt(fromS);
      target.pan.pan.setValueCurveAtTime(curve(panAt), start, span);
    } else {
      target.pan.pan.value = audio?.pan ?? 0;
    }
  }

  #planClip(clip: Clip, fromUs: number, where: Placement): ClipPlan | null {
    const startUs = Math.max(clip.startUs - where.offsetUs, where.windowStartUs);
    const endUs = Math.min(clip.startUs - where.offsetUs + clipDurationUs(clip), where.windowEndUs);
    if (endUs <= Math.max(fromUs, startUs)) return null; // over (or cut off) before playback starts
    const fail = (code: string, message: string): null => {
      this.#diagnostics.push({ clipId: clip.id, level: "error", code, message });
      return null;
    };
    if (clip.type === "composition") return null; // planned by #planNested
    if (clip.type !== "media" || clip.assetId === undefined) {
      return fail("not_audio", `${clip.type} clips on an audio track make no sound.`);
    }
    const asset = this.#assets.get(clip.assetId);
    if (asset === undefined)
      return fail("missing_asset", `Asset ${clip.assetId} isn't in the project.`);
    if (asset.audio === undefined)
      return fail("no_audio_stream", `Asset ${asset.id} has no audio.`);
    if (clip.freezeAtUs !== undefined)
      return fail("audio_freeze_silent", "A freeze frame has no sound.");
    if (clip.reversed && (clip.outUs - clip.inUs) / US > MAX_REVERSE_S) {
      return fail(
        "audio_reverse_too_long",
        `Reversed sound is limited to ${String(MAX_REVERSE_S / 60)} minutes per clip; this clip is silent.`,
      );
    }

    // The clip's own chain: effects (native nodes) → volume → pan → its bus.
    const entry = this.#context.createGain();
    const nodes: AudioNode[] = [];
    let tail: AudioNode = entry;
    const pending: AudioEffectDefinition[] = [];
    const pendingParams: Params[] = [];
    for (const instance of clip.audio?.effects ?? []) {
      if (!instance.enabled) continue;
      const def = audioEffectById(instance.effectId);
      if (def === undefined) {
        this.#warn(
          clip,
          "unknown_audio_effect",
          `There is no audio effect "${instance.effectId}"; it was skipped.`,
        );
        continue;
      }
      const params = new Params(def.params, instance.params);
      if (def.processor !== undefined) {
        pending.push(def);
        pendingParams.push(params);
      }
      if (def.build !== undefined) {
        const graph = def.build(this.#context, params);
        tail.connect(graph.input);
        tail = graph.output;
        nodes.push(graph.input, graph.output);
      }
    }
    const gain = this.#context.createGain();
    const pan = this.#context.createStereoPanner();
    tail.connect(gain);
    gain.connect(pan);
    pan.connect(where.bus.input);
    nodes.push(gain, pan);
    this.#automate({ input: gain, pan }, clip, where.offsetUs, startUs, endUs, fromUs);

    const startS = startUs / US;
    const clipStartS = (clip.startUs - where.offsetUs) / US;
    const inS = clip.inUs / US;
    const outS = clip.outUs / US;
    const nowS = Math.max(this.#origin.timelineS, startS);
    // Source position at the moment playback starts (or the clip begins).
    const playedS = (nowS - clipStartS) * clip.speed;
    const preserve = clip.preservePitch ?? true;
    return {
      clipId: clip.id,
      assetId: asset.id,
      startS,
      endS: endUs / US,
      inS,
      outS,
      speed: clip.speed,
      rate: preserve ? 1 : clip.speed,
      reversed: clip.reversed,
      fromSourceS: clip.reversed ? outS - playedS : inS + playedS,
      cursorS: nowS,
      stretcher: null,
      processors: [],
      pending,
      pendingParams,
      entry,
      nodes,
      iterator: null,
      reversedChannels: null,
      reversedRate: 0,
      sourceRate: this.#context.sampleRate,
      done: false,
      sources: new Set(),
    };
  }

  async #schedule(untilUs: number): Promise<void> {
    const generation = this.#generation;
    await Promise.all(this.#plans.map((plan) => this.#pump(plan, untilUs / US, generation)));
  }

  /** Does this clip need its samples processed (anything beyond plain playback)? */
  #processed(plan: ClipPlan): boolean {
    return plan.reversed || plan.pending.length > 0 || (plan.speed !== 1 && plan.rate === 1);
  }

  async #pump(plan: ClipPlan, untilS: number, generation: number): Promise<void> {
    if (plan.done || plan.cursorS >= untilS) return;
    try {
      if (plan.reversed) {
        await this.#pumpReversed(plan, untilS, generation);
        return;
      }
      if (plan.iterator === null) {
        const media = await this.#registry.audio(plan.assetId);
        if (generation !== this.#generation) return;
        plan.iterator = media.sink.buffers(plan.fromSourceS, plan.outS);
        this.stats.iteratorsOpened += 1;
      }
      while (plan.cursorS < Math.min(untilS, plan.endS)) {
        const next = await plan.iterator.next();
        if (generation !== this.#generation) return;
        if (next.done === true) {
          this.#finish(plan);
          await this.#closeIterator(plan);
          return;
        }
        const { buffer, timestamp } = next.value;
        const from = Math.max(timestamp, plan.fromSourceS);
        const to = Math.min(timestamp + buffer.duration, plan.outS);
        if (to > from) {
          if (this.#processed(plan)) {
            const first = Math.round((from - timestamp) * buffer.sampleRate);
            const last = Math.round((to - timestamp) * buffer.sampleRate);
            const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) =>
              buffer.getChannelData(c).slice(first, last),
            );
            this.#emit(plan, this.#process(plan, channels, buffer.sampleRate), buffer.sampleRate);
          } else {
            this.#emitBuffer(plan, buffer, from - timestamp, to - from);
          }
        }
        if (timestamp + buffer.duration >= plan.outS) {
          this.#finish(plan);
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

  /** Reversed clips: decode the whole range once, reverse it, then hand it out in pieces. */
  async #pumpReversed(plan: ClipPlan, untilS: number, generation: number): Promise<void> {
    if (plan.reversedChannels === null) {
      const media = await this.#registry.audio(plan.assetId);
      if (generation !== this.#generation) return;
      const iterator = media.sink.buffers(plan.inS, plan.fromSourceS);
      this.stats.iteratorsOpened += 1;
      const pieces: Float32Array[][] = [];
      let rate = 0;
      try {
        for await (const { buffer, timestamp } of iterator) {
          if (generation !== this.#generation) return;
          rate = buffer.sampleRate;
          const from = Math.max(timestamp, plan.inS);
          const to = Math.min(timestamp + buffer.duration, plan.fromSourceS);
          if (to <= from) continue;
          const first = Math.round((from - timestamp) * rate);
          const last = Math.round((to - timestamp) * rate);
          pieces.push(
            Array.from({ length: buffer.numberOfChannels }, (_, c) =>
              buffer.getChannelData(c).slice(first, last),
            ),
          );
        }
      } finally {
        this.stats.iteratorsClosed += 1;
      }
      const channels = Math.max(1, ...pieces.map((p) => p.length));
      const total = pieces.reduce((n, p) => n + (p[0]?.length ?? 0), 0);
      const joined = Array.from({ length: channels }, () => new Float32Array(total));
      let at = 0;
      for (const piece of pieces) {
        for (let c = 0; c < channels; c += 1) joined[c]?.set(piece[c] ?? piece[0] ?? [], at);
        at += piece[0]?.length ?? 0;
      }
      plan.reversedChannels = reverseChannels(joined);
      plan.reversedRate = rate || this.#context.sampleRate;
    }
    const rate = plan.reversedRate;
    const chunk = Math.round(rate * 0.5);
    while (plan.cursorS < Math.min(untilS, plan.endS)) {
      const all: Float32Array[] = plan.reversedChannels;
      if ((all[0]?.length ?? 0) === 0) {
        this.#finish(plan);
        return;
      }
      plan.reversedChannels = all.map((ch) => ch.subarray(chunk));
      this.#emit(
        plan,
        this.#process(
          plan,
          all.map((ch) => ch.slice(0, chunk)),
          rate,
        ),
        rate,
      );
    }
  }

  /** Time-stretch and sample processors (gate) on one piece of decoded sound. */
  #process(plan: ClipPlan, channels: Float32Array[], sampleRate: number): Float32Array[] {
    plan.sourceRate = sampleRate;
    let out = channels;
    if (plan.speed !== 1 && plan.rate === 1) {
      plan.stretcher ??= new TimeStretcher(channels.length, sampleRate, plan.speed);
      out = plan.stretcher.push(out);
    }
    if (plan.processors.length === 0 && plan.pending.length > 0) {
      plan.processors = plan.pending.map(
        (def, i) =>
          def.processor?.(sampleRate, plan.pendingParams[i] ?? new Params([], {})) ?? {
            process: () => undefined,
          },
      );
    }
    for (const processor of plan.processors) processor.process(out);
    return out;
  }

  /** The source ran out: flush what the stretcher still holds. */
  #finish(plan: ClipPlan): void {
    plan.done = true;
    if (plan.stretcher !== null) {
      const tail = plan.stretcher.flush();
      for (const processor of plan.processors) processor.process(tail);
      this.#emit(plan, tail, plan.sourceRate);
    }
  }

  /** Schedules processed samples at the clip's cursor. */
  #emit(plan: ClipPlan, channels: Float32Array[], sampleRate: number): void {
    const length = channels[0]?.length ?? 0;
    if (length === 0) return;
    const buffer = this.#context.createBuffer(channels.length, length, sampleRate);
    channels.forEach((ch, c) => {
      buffer.copyToChannel(ch as Float32Array<ArrayBuffer>, c);
    });
    // Resampled speed (pitch follows) is played back faster; stretched sound is already in time.
    this.#emitBuffer(plan, buffer, 0, buffer.duration);
  }

  /**
   * Plays `duration` seconds of `buffer` from `offset` at the clip's cursor (at the clip's
   * playback rate when it isn't time-stretched) and moves the cursor on. Cut at the clip's end.
   */
  #emitBuffer(plan: ClipPlan, buffer: AudioBuffer, offset: number, duration: number): void {
    const rate = plan.rate;
    let timelineLength = duration / rate;
    timelineLength = Math.min(timelineLength, plan.endS - plan.cursorS);
    if (timelineLength <= 0) return;
    let when = this.#origin.contextTime + (plan.cursorS - this.#origin.timelineS);
    let bufferOffset = offset;
    let bufferDuration = timelineLength * rate;
    plan.cursorS += timelineLength;
    // Decoded late (the context time already passed): skip the part that should have played.
    const now = this.#context.currentTime;
    if (when < now) {
      const skip = now - when;
      if (skip >= timelineLength) return;
      bufferOffset += skip * rate;
      bufferDuration -= skip * rate;
      when = now;
    }
    const node = this.#context.createBufferSource();
    node.buffer = buffer;
    node.playbackRate.value = rate;
    node.connect(plan.entry);
    node.onended = () => {
      if (plan.sources.delete(node)) {
        this.stats.sourcesActive -= 1;
        node.disconnect();
      }
    };
    plan.sources.add(node);
    this.stats.sourcesScheduled += 1;
    this.stats.sourcesActive += 1;
    node.start(when, bufferOffset, bufferDuration);
  }

  async #closeIterator(plan: ClipPlan): Promise<void> {
    const iterator = plan.iterator;
    if (iterator === null) return;
    plan.iterator = null;
    this.stats.iteratorsClosed += 1;
    await iterator.return();
  }
}
