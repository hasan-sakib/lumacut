import type { Clip, Composition, Op, Project } from "@lumacut/schema";
import { useState } from "react";
import type { ClipInfo } from "../../inspector/fields.ts";
import { Section } from "../inspector/Section.tsx";

interface MatteInspectorProps {
  item: ClipInfo;
  project: Project | undefined;
  composition: Composition;
  onChange: (op: Op, coalesceKey: string | undefined) => void;
}

const MODES = [
  { value: "alpha", label: "Alpha (show where the matte is solid)" },
  { value: "alphaInverted", label: "Inverted alpha (show where it is clear)" },
  { value: "luma", label: "Luma (show where the matte is bright)" },
  { value: "lumaInverted", label: "Inverted luma (show where it is dark)" },
] as const;

/** A readable name for a clip in a list: its asset's name, or what kind of clip it is. */
export function clipLabel(clip: Clip, project: Project | undefined): string {
  const asset = project?.assets.find((a) => a.id === clip.assetId);
  const what = asset?.name ?? clip.type;
  return `${what} (${(clip.startUs / 1_000_000).toFixed(1)} s)`;
}

/**
 * A track matte: another clip supplies this clip's transparency (its alpha or brightness). The
 * clip used as a matte is not drawn on its own.
 */
export function MatteInspector({ item, project, composition, onChange }: MatteInspectorProps) {
  const [open, setOpen] = useState(true);
  const clip = item.clip;
  const candidates = composition.tracks
    .filter((t) => t.kind === "visual")
    .flatMap((t) => t.clips)
    .filter((c) => c.id !== clip.id);
  const current = clip.trackMatte;
  const set = (patch: Partial<NonNullable<Clip["trackMatte"]>>) => {
    const base = current ?? { sourceClipId: candidates[0]?.id ?? "", mode: "alpha" as const };
    if (base.sourceClipId === "" && patch.sourceClipId === undefined) return;
    onChange(
      { type: "setProps", clipId: clip.id, props: { trackMatte: { ...base, ...patch } } },
      undefined,
    );
  };
  return (
    <Section
      id="matte"
      title="Track matte"
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
      <label className="grid grid-cols-[1.25rem_6rem_1fr] items-center gap-2 text-xs text-neutral-300">
        <span />
        <span>Matte clip</span>
        <select
          aria-label="Matte clip"
          value={current?.sourceClipId ?? ""}
          onChange={(e) => {
            if (e.target.value === "") {
              onChange(
                { type: "setProps", clipId: clip.id, props: {}, unset: ["trackMatte"] },
                undefined,
              );
            } else {
              set({ sourceClipId: e.target.value });
            }
          }}
          className="rounded border border-neutral-700 bg-neutral-950 px-1.5 py-1 text-xs text-neutral-100"
        >
          <option value="">None</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {clipLabel(c, project)}
            </option>
          ))}
        </select>
      </label>
      {current !== undefined && (
        <label className="grid grid-cols-[1.25rem_6rem_1fr] items-center gap-2 text-xs text-neutral-300">
          <span />
          <span>Use</span>
          <select
            aria-label="Matte mode"
            value={current.mode}
            onChange={(e) => {
              const mode = MODES.find((m) => m.value === e.target.value)?.value ?? "alpha";
              set({ mode });
            }}
            className="rounded border border-neutral-700 bg-neutral-950 px-1.5 py-1 text-xs text-neutral-100"
          >
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {current !== undefined && (
        <p className="text-xs text-neutral-500">
          The matte clip is hidden: only its shape shows through this clip.
        </p>
      )}
    </Section>
  );
}
