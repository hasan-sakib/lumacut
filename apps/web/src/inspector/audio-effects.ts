import { audioEffectById, type ParamDef } from "@lumacut/effects";
import type { AudioEffectInstance, Clip, ClipAudio, ClipPatch } from "@lumacut/schema";
import { choiceField, flagField, numberField, type ItemGroup, type ItemRow } from "./synthetic.ts";

const DEFAULT_AUDIO: ClipAudio = { volume: 1, pan: 0, fadeInUs: 0, fadeOutUs: 0, effects: [] };
const audioOf = (clip: Clip): ClipAudio => clip.audio ?? DEFAULT_AUDIO;

const withEffect = (
  clip: Clip,
  id: string,
  change: (e: AudioEffectInstance) => AudioEffectInstance,
): ClipPatch => {
  const audio = audioOf(clip);
  return { audio: { ...audio, effects: audio.effects.map((e) => (e.id === id ? change(e) : e)) } };
};

const instanceOf = (clip: Clip, id: string): AudioEffectInstance | undefined =>
  clip.audio?.effects.find((e) => e.id === id);

/** One Inspector row for one parameter of an audio effect instance (generated from its definition). */
function paramRow(instanceId: string, def: ParamDef): ItemRow | null {
  const has = (clip: Clip) => instanceOf(clip, instanceId) !== undefined;
  const id = `audioFx:${instanceId}:${def.id}`;
  const value = (clip: Clip) => instanceOf(clip, instanceId)?.params[def.id];
  const write = (clip: Clip, v: number | string | boolean): ClipPatch =>
    withEffect(clip, instanceId, (e) => ({ ...e, params: { ...e.params, [def.id]: v } }));
  if (def.type === "number" || def.type === "int") {
    return {
      type: "field",
      field: numberField({
        id,
        label: def.label,
        has,
        read: (clip) => {
          const v = value(clip);
          return typeof v === "number" ? v : def.default;
        },
        write,
        min: def.min,
        max: def.max,
        step: def.step ?? (def.type === "int" ? 1 : 0.01),
        ...(def.unit === undefined ? {} : { unit: def.unit }),
        ...(def.display === undefined ? {} : { display: def.display }),
      }),
    };
  }
  if (def.type === "boolean") {
    return {
      type: "field",
      field: flagField({
        id,
        label: def.label,
        has,
        read: (clip) => {
          const v = value(clip);
          return typeof v === "boolean" ? v : def.default;
        },
        write,
      }),
    };
  }
  if (def.type === "enum") {
    return {
      type: "field",
      field: choiceField({
        id,
        label: def.label,
        options: def.options,
        has,
        read: (clip) => {
          const v = value(clip);
          return typeof v === "string" ? v : def.default;
        },
        write,
      }),
    };
  }
  return null; // audio effects have no colour or point parameters
}

/** The clip's audio effects, top of the chain first: their parameters, on/off, order, remove. */
export function audioEffectGroups(clip: Clip): ItemGroup[] {
  const effects = audioOf(clip).effects;
  return effects.map((instance, index) => {
    const def = audioEffectById(instance.effectId);
    const name = def?.name ?? instance.effectId;
    const rows: ItemRow[] = [];
    rows.push({
      type: "button",
      label: instance.enabled ? `Turn ${name} off` : `Turn ${name} on`,
      description: "Bypass this effect, or use it again.",
      op: (c) => ({
        type: "setProps",
        clipId: c.id,
        props: withEffect(c, instance.id, (e) => ({ ...e, enabled: !e.enabled })),
      }),
    });
    for (const param of def?.params ?? []) {
      const row = paramRow(instance.id, param);
      if (row !== null) rows.push(row);
    }
    const move = (direction: -1 | 1) => (c: Clip) => {
      const audio = audioOf(c);
      const list = [...audio.effects];
      const from = list.findIndex((e) => e.id === instance.id);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= list.length) return null;
      const [moved] = list.splice(from, 1);
      if (moved !== undefined) list.splice(to, 0, moved);
      return {
        type: "setProps" as const,
        clipId: c.id,
        props: { audio: { ...audio, effects: list } },
      };
    };
    if (index > 0) {
      rows.push({
        type: "button",
        label: "Move up",
        description: "Earlier in the chain.",
        op: move(-1),
      });
    }
    if (index < effects.length - 1) {
      rows.push({
        type: "button",
        label: "Move down",
        description: "Later in the chain.",
        op: move(1),
      });
    }
    rows.push({
      type: "button",
      label: `Remove ${name}`,
      description: "Delete this effect.",
      danger: true,
      op: (c) => {
        const audio = audioOf(c);
        return {
          type: "setProps",
          clipId: c.id,
          props: {
            audio: { ...audio, effects: audio.effects.filter((e) => e.id !== instance.id) },
          },
        };
      },
    });
    return {
      id: instance.id,
      title:
        def === undefined
          ? `Unknown effect “${instance.effectId}”`
          : `${name}${instance.enabled ? "" : " (off)"}`,
      rows,
    };
  });
}
