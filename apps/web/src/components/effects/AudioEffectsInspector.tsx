import { AUDIO_EFFECTS, defaultParams } from "@lumacut/effects";
import type { Op } from "@lumacut/schema";
import { useState } from "react";
import { audioEffectGroups } from "../../inspector/audio-effects.ts";
import type { ClipInfo } from "../../inspector/fields.ts";
import { newId } from "../../lib/ids.ts";
import { Section } from "../inspector/Section.tsx";
import { ItemGroups } from "../params/ItemGroups.tsx";

interface AudioEffectsInspectorProps {
  item: ClipInfo;
  playheadUs: number;
  onChange: (op: Op, coalesceKey: string | undefined) => void;
}

/**
 * A clip's audio effect chain (sound flows top to bottom): add one, then its controls, generated
 * from the effect's parameter definitions (`@lumacut/effects`), on/off, order and remove.
 */
export function AudioEffectsInspector({ item, playheadUs, onChange }: AudioEffectsInspectorProps) {
  const [open, setOpen] = useState(true);
  const clip = item.clip;
  const audio = clip.audio ?? { volume: 1, pan: 0, fadeInUs: 0, fadeOutUs: 0, effects: [] };
  return (
    <Section
      id="audioEffects"
      title="Audio effects"
      open={open}
      onToggle={() => {
        setOpen((o) => !o);
      }}
      hasAdvanced={false}
      hiddenAdvanced={0}
      advanced={false}
      onToggleAdvanced={() => undefined}
      searching={false}
    >
      <label className="flex items-center gap-2 text-xs text-neutral-300">
        Add
        <select
          aria-label="Add an audio effect"
          value=""
          onChange={(e) => {
            const def = AUDIO_EFFECTS.find((d) => d.id === e.target.value);
            if (def === undefined) return;
            onChange(
              {
                type: "setProps",
                clipId: clip.id,
                props: {
                  audio: {
                    ...audio,
                    effects: [
                      ...audio.effects,
                      {
                        id: newId(),
                        effectId: def.id,
                        enabled: true,
                        params: defaultParams(def.params),
                      },
                    ],
                  },
                },
              },
              undefined,
            );
          }}
          className="flex-1 rounded border border-neutral-700 bg-neutral-950 px-1 py-1 text-neutral-100"
        >
          <option value="">Choose an effect…</option>
          {AUDIO_EFFECTS.map((def) => (
            <option key={def.id} value={def.id} title={def.description}>
              {def.name}
            </option>
          ))}
        </select>
      </label>
      {audio.effects.length === 0 ? (
        <p className="text-xs text-neutral-500">
          No audio effects. Sound flows through them top to bottom.
        </p>
      ) : (
        <ItemGroups
          groups={audioEffectGroups(clip)}
          item={item}
          playheadUs={playheadUs}
          onChange={onChange}
        />
      )}
    </Section>
  );
}
