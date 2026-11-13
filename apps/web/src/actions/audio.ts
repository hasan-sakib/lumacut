import { ActionError } from "@lumacut/actions";
import { AUDIO_EFFECTS, audioEffectById, defaultParams } from "@lumacut/effects";
import { LOUDNESS_TARGETS, encodeWav, measureLoudness, normalizeLoudness } from "@lumacut/engine";
import type { AudioEffectInstance, Clip, ClipAudio, Op } from "@lumacut/schema";
import * as z from "zod";
import { placedClips } from "../timeline/clips.ts";
import { activeComposition, editingActions, type EditingContext } from "./editing.ts";

const DEFAULT_AUDIO: ClipAudio = { volume: 1, pan: 0, fadeInUs: 0, fadeOutUs: 0, effects: [] };
const audioOf = (clip: Clip): ClipAudio => clip.audio ?? DEFAULT_AUDIO;
const gainOf = (db: number): number => Math.min(4, Math.max(0, 10 ** (db / 20)));

/** Clips whose sound the audio actions change: unlocked audio-track clips and nested compositions. */
function targets(ctx: EditingContext): Clip[] {
  const comp = activeComposition(ctx);
  if (comp === undefined) return [];
  const wanted = new Set(ctx.selectedClipIds);
  return placedClips(comp)
    .filter(
      (p) =>
        wanted.has(p.clip.id) &&
        !p.track.locked &&
        ((p.track.kind === "audio" && p.clip.type === "media") || p.clip.type === "composition"),
    )
    .map((p) => p.clip);
}

const hasTargets = (ctx: EditingContext): boolean => targets(ctx).length > 0;

function needTargets(ctx: EditingContext): Clip[] {
  const found = targets(ctx);
  if (found.length === 0) throw new ActionError("Select an audio clip first.");
  return found;
}

const setAudio = (clip: Clip, audio: ClipAudio): Op => ({
  type: "setProps",
  clipId: clip.id,
  props: { audio },
});

const EFFECT_IDS = AUDIO_EFFECTS.map((e) => e.id) as [string, ...string[]];
const EffectArg = z
  .enum(EFFECT_IDS)
  .describe("Audio effect: " + AUDIO_EFFECTS.map((e) => `${e.id} (${e.name})`).join("; "));

editingActions.register({
  id: "audio.addEffect",
  title: "Add an audio effect",
  description:
    "Add an audio effect (equaliser, compressor, limiter, noise gate, reverb, delay) to the selected audio clips. Change its settings in the Inspector.",
  keywords: [
    "audio effect",
    "eq",
    "equalizer",
    "compressor",
    "reverb",
    "echo",
    "gate",
    "limiter",
    "sound",
  ],
  category: "Audio",
  icon: "audio",
  argsSchema: z.object({ effect: EffectArg }),
  when: hasTargets,
  run: (ctx, args): Op[] => {
    const def = audioEffectById(args.effect);
    if (def === undefined) throw new ActionError("Unknown audio effect.");
    return needTargets(ctx).map((clip) => {
      const audio = audioOf(clip);
      const instance: AudioEffectInstance = {
        id: ctx.services.newId(),
        effectId: def.id,
        enabled: true,
        params: defaultParams(def.params),
      };
      return setAudio(clip, { ...audio, effects: [...audio.effects, instance] });
    });
  },
});

/** The instances of an audio effect id (or one instance id) on the selected clips. */
function instances(
  ctx: EditingContext,
  effect: string,
): { clip: Clip; instance: AudioEffectInstance }[] {
  return targets(ctx).flatMap((clip) =>
    audioOf(clip)
      .effects.filter((e) => e.id === effect || e.effectId === effect)
      .map((instance) => ({ clip, instance })),
  );
}

const hasEffects = (ctx: EditingContext): boolean =>
  targets(ctx).some((c) => audioOf(c).effects.length > 0);

editingActions.register({
  id: "audio.removeEffect",
  title: "Remove an audio effect",
  description: "Remove an audio effect (by effect id or instance id) from the selected clips.",
  keywords: ["remove audio effect", "delete effect", "audio"],
  category: "Audio",
  argsSchema: z.object({ effect: z.string().describe("Effect id (e.g. reverb) or instance id") }),
  when: hasEffects,
  run: (ctx, args): Op[] => {
    const found = instances(ctx, args.effect);
    if (found.length === 0) throw new ActionError("The selected clips have no such audio effect.");
    const drop = new Set(found.map((f) => f.instance.id));
    return [...new Set(found.map((f) => f.clip))].map((clip) => {
      const audio = audioOf(clip);
      return setAudio(clip, { ...audio, effects: audio.effects.filter((e) => !drop.has(e.id)) });
    });
  },
});

editingActions.register({
  id: "audio.toggleEffect",
  title: "Turn an audio effect on or off",
  description: "Bypass an audio effect on the selected clips, or turn it back on.",
  keywords: ["bypass", "enable", "disable", "audio effect", "on off"],
  category: "Audio",
  argsSchema: z.object({ effect: z.string(), enabled: z.boolean().optional() }),
  when: hasEffects,
  run: (ctx, args): Op[] => {
    const found = instances(ctx, args.effect);
    if (found.length === 0) throw new ActionError("The selected clips have no such audio effect.");
    const ids = new Set(found.map((f) => f.instance.id));
    return [...new Set(found.map((f) => f.clip))].map((clip) => {
      const audio = audioOf(clip);
      return setAudio(clip, {
        ...audio,
        effects: audio.effects.map((e) =>
          ids.has(e.id) ? { ...e, enabled: args.enabled ?? !e.enabled } : e,
        ),
      });
    });
  },
});

editingActions.register({
  id: "audio.moveEffect",
  title: "Move an audio effect",
  description:
    "Move an audio effect earlier or later in the selected clip's chain (sound flows top to bottom).",
  keywords: ["reorder", "chain", "audio effect", "order", "up", "down"],
  category: "Audio",
  argsSchema: z.object({ effect: z.string(), direction: z.enum(["up", "down"]) }),
  when: hasEffects,
  run: (ctx, args): Op[] =>
    instances(ctx, args.effect).map(({ clip, instance }) => {
      const audio = audioOf(clip);
      const list = [...audio.effects];
      const from = list.findIndex((e) => e.id === instance.id);
      const to = Math.max(0, Math.min(list.length - 1, from + (args.direction === "up" ? -1 : 1)));
      const [moved] = list.splice(from, 1);
      if (moved !== undefined) list.splice(to, 0, moved);
      return setAudio(clip, { ...audio, effects: list });
    }),
});

editingActions.register({
  id: "audio.setVolume",
  title: "Set clip volume",
  description:
    "Set the volume of the selected audio clips in dB (0 = unchanged, −6 = about half as loud, up to +12).",
  keywords: ["volume", "gain", "louder", "quieter", "level", "db"],
  category: "Audio",
  icon: "audio",
  argsSchema: z.object({ db: z.number().min(-60).max(12) }),
  when: hasTargets,
  run: (ctx, args): Op[] =>
    needTargets(ctx).map((clip) => setAudio(clip, { ...audioOf(clip), volume: gainOf(args.db) })),
});

editingActions.register({
  id: "audio.setPan",
  title: "Set clip pan",
  description:
    "Place the selected audio clips left or right: −100 (left) … 0 (centre) … 100 (right).",
  keywords: ["pan", "balance", "left", "right", "stereo"],
  category: "Audio",
  argsSchema: z.object({ pan: z.number().min(-100).max(100) }),
  when: hasTargets,
  run: (ctx, args): Op[] =>
    needTargets(ctx).map((clip) => setAudio(clip, { ...audioOf(clip), pan: args.pan / 100 })),
});

editingActions.register({
  id: "audio.fade",
  title: "Fade audio in / out",
  description: "Give the selected audio clips a fade in and/or fade out (seconds; 0 removes it).",
  keywords: ["fade", "fade in", "fade out", "ramp", "smooth start", "smooth end"],
  category: "Audio",
  argsSchema: z.object({
    in: z.number().min(0).max(60).optional().describe("Fade-in seconds"),
    out: z.number().min(0).max(60).optional().describe("Fade-out seconds"),
  }),
  when: hasTargets,
  run: (ctx, args): Op[] => {
    if (args.in === undefined && args.out === undefined) {
      throw new ActionError("Give a fade-in or fade-out length.");
    }
    return needTargets(ctx).map((clip) => {
      const audio = audioOf(clip);
      return setAudio(clip, {
        ...audio,
        ...(args.in === undefined ? {} : { fadeInUs: Math.round(args.in * 1_000_000) }),
        ...(args.out === undefined ? {} : { fadeOutUs: Math.round(args.out * 1_000_000) }),
      });
    });
  },
});

editingActions.register({
  id: "clip.setPreservePitch",
  title: "Keep pitch when changing speed",
  description:
    "When a clip plays faster or slower, keep its pitch (voices sound natural) or let the pitch follow the speed like a tape.",
  keywords: ["pitch", "speed", "chipmunk", "time stretch", "preserve pitch", "tape"],
  category: "Audio",
  argsSchema: z.object({ keep: z.boolean().optional() }),
  when: (ctx) => {
    const comp = activeComposition(ctx);
    const wanted = new Set(ctx.selectedClipIds);
    return (
      comp !== undefined && placedClips(comp).some((p) => wanted.has(p.clip.id) && !p.track.locked)
    );
  },
  run: (ctx, args): Op[] => {
    const comp = activeComposition(ctx);
    if (comp === undefined) throw new ActionError("Open a composition first.");
    const wanted = new Set(ctx.selectedClipIds);
    return placedClips(comp)
      .filter((p) => wanted.has(p.clip.id) && !p.track.locked)
      .map(({ clip }) => ({
        type: "setProps" as const,
        clipId: clip.id,
        props: { preservePitch: args.keep ?? !(clip.preservePitch ?? true) },
      }));
  },
});

// --- Mixer ------------------------------------------------------------------------------------

const TrackLevel = z.object({
  trackId: z.string().optional().describe("The track (default: the selected one)"),
});

function trackOf(ctx: EditingContext, trackId: string | undefined) {
  const id = trackId ?? ctx.selectedTrackId;
  const track = activeComposition(ctx)?.tracks.find((t) => t.id === id);
  if (track === undefined) throw new ActionError("Select a track first.");
  return track;
}

editingActions.register({
  id: "track.setVolume",
  title: "Set track volume",
  description: "Move a track's mixer fader, in dB (0 = unchanged, up to +12).",
  keywords: ["fader", "track volume", "mixer", "level", "gain", "db"],
  category: "Mixer",
  argsSchema: TrackLevel.extend({ db: z.number().min(-60).max(12) }),
  when: (ctx) => (activeComposition(ctx)?.tracks.length ?? 0) > 0,
  run: (ctx, args): Op => {
    const track = trackOf(ctx, args.trackId);
    return {
      type: "setTrackProps",
      trackId: track.id,
      props: { audio: { volume: gainOf(args.db), pan: track.audio?.pan ?? 0 } },
    };
  },
});

editingActions.register({
  id: "track.setPan",
  title: "Set track pan",
  description: "Place a whole track left or right in the mix: −100 (left) … 100 (right).",
  keywords: ["pan", "track pan", "mixer", "balance", "stereo"],
  category: "Mixer",
  argsSchema: TrackLevel.extend({ pan: z.number().min(-100).max(100) }),
  when: (ctx) => (activeComposition(ctx)?.tracks.length ?? 0) > 0,
  run: (ctx, args): Op => {
    const track = trackOf(ctx, args.trackId);
    return {
      type: "setTrackProps",
      trackId: track.id,
      props: { audio: { volume: track.audio?.volume ?? 1, pan: args.pan / 100 } },
    };
  },
});

editingActions.register({
  id: "mixer.setMasterVolume",
  title: "Set master volume",
  description: "Move the master fader: the level of the whole mix, in dB.",
  keywords: ["master", "master volume", "mixer", "output", "overall level"],
  category: "Mixer",
  argsSchema: z.object({ db: z.number().min(-60).max(12) }),
  when: (ctx) => activeComposition(ctx) !== undefined,
  run: (ctx, args): Op => {
    const comp = activeComposition(ctx);
    if (comp === undefined) throw new ActionError("Open a composition first.");
    return {
      type: "updateComposition",
      compositionId: comp.id,
      props: { audio: { volume: gainOf(args.db) } },
    };
  },
});

editingActions.register({
  id: "panel.showMixer",
  title: "Mixer",
  description:
    "Show the audio mixer (a fader, pan and meter for every audio track, the master level and loudness) instead of the timeline.",
  keywords: ["mixer", "audio", "faders", "levels", "meters", "loudness", "lufs"],
  category: "View",
  icon: "audio",
  shortcut: "Shift+X",
  when: (ctx) => activeComposition(ctx) !== undefined,
  run: (ctx) => {
    ctx.services.editor.setBottomPanel("mixer");
    return undefined;
  },
});

// --- Loudness and export ----------------------------------------------------------------------

const TARGET = z
  .enum(["social", "broadcast", "none"])
  .describe("social = −14 LUFS, broadcast = −23 LUFS, none = as mixed");

function wholeRange(ctx: EditingContext): { compositionId: string; fromUs: number; toUs: number } {
  const comp = activeComposition(ctx);
  if (comp === undefined) throw new ActionError("Open a composition first.");
  if (comp.durationUs <= 0)
    throw new ActionError("There is nothing to hear: the composition is empty.");
  return { compositionId: comp.id, fromUs: 0, toUs: comp.durationUs };
}

editingActions.register({
  id: "audio.measureLoudness",
  title: "Measure loudness",
  description:
    "Mix the whole composition offline and measure it exactly (integrated loudness in LUFS, true peak in dBTP). The result shows in the mixer.",
  keywords: ["loudness", "lufs", "measure", "analyse", "true peak", "level", "r128"],
  category: "Mixer",
  when: (ctx) => ctx.services.audio !== undefined && (activeComposition(ctx)?.durationUs ?? 0) > 0,
  run: async (ctx) => {
    const audio = ctx.services.audio;
    if (audio === undefined) throw new ActionError("Measuring isn't available here.");
    const range = wholeRange(ctx);
    let mix: { channels: Float32Array[]; sampleRate: number };
    try {
      mix = await audio.renderMix(range.compositionId, range.fromUs, range.toUs);
    } catch (error) {
      throw new ActionError(
        error instanceof Error ? error.message : "The mix couldn't be rendered.",
      );
    }
    audio.showLoudness(measureLoudness(mix.channels, mix.sampleRate));
    return undefined;
  },
});

const safeName = (name: string): string =>
  name
    .replace(/[^\w .-]+/g, "")
    .trim()
    .replace(/\s+/g, "-") || "mix";

editingActions.register({
  id: "export.audio",
  title: "Export audio (WAV)",
  description:
    "Save the sound of the whole composition as a WAV file, optionally normalised to a loudness target: social media (−14 LUFS) or broadcast (−23 LUFS), with true peaks kept under −1 dBTP.",
  keywords: ["export audio", "wav", "mixdown", "bounce", "loudness", "normalize", "lufs", "sound"],
  category: "Export",
  icon: "download",
  argsSchema: z.object({
    target: TARGET.optional(),
    bits: z.enum(["16", "24"]).optional().describe("Bit depth, default 24"),
    filename: z.string().optional(),
  }),
  when: (ctx) => ctx.services.audio !== undefined && (activeComposition(ctx)?.durationUs ?? 0) > 0,
  run: async (ctx, args) => {
    const audio = ctx.services.audio;
    if (audio === undefined) throw new ActionError("Exporting isn't available here.");
    const range = wholeRange(ctx);
    let mix: { channels: Float32Array[]; sampleRate: number };
    try {
      mix = await audio.renderMix(range.compositionId, range.fromUs, range.toUs);
    } catch (error) {
      throw new ActionError(
        error instanceof Error ? error.message : "The mix couldn't be rendered.",
      );
    }
    const target = args.target ?? "none";
    let channels = mix.channels;
    if (target !== "none") {
      const result = normalizeLoudness(channels, mix.sampleRate, LOUDNESS_TARGETS[target]);
      channels = result.channels;
      audio.showLoudness(result.after);
    } else {
      audio.showLoudness(measureLoudness(channels, mix.sampleRate));
    }
    const wav = encodeWav(channels, mix.sampleRate, args.bits === "16" ? 16 : 24);
    audio.download(
      new Blob([wav], { type: "audio/wav" }),
      `${safeName(args.filename ?? ctx.project?.name ?? "mix")}.wav`,
    );
    return undefined;
  },
});
