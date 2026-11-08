import { evaluate } from "@lumacut/ops";
import type { Clip, Color, Op } from "@lumacut/schema";
import {
  animatedSetOp,
  keyframeToggleOps,
  keyStateOf,
  playheadOnClip,
} from "../../inspector/animation.ts";
import { colorToHex, hexToColor } from "../../inspector/effects.ts";
import type { ClipInfo, FieldDef } from "../../inspector/fields.ts";
import { KeyframeToggle } from "./KeyframeToggle.tsx";

interface ColorRowProps {
  label: string;
  /** Carries the keyframe path (`animation`) of the colour. */
  field: FieldDef;
  item: ClipInfo;
  playheadUs: number;
  /** The colour as stored (before animation). */
  stored: Color | undefined;
  /** The op that sets the stored colour (used when the colour isn't animated). */
  write: (color: Color) => Op;
  onChange: (op: Op, coalesceKey: string | undefined) => void;
}

function animated(clip: Clip, path: string | undefined, playheadUs: number): Color | undefined {
  if (path === undefined || (clip.keyframes[path]?.length ?? 0) === 0) return undefined;
  const v = evaluate(clip, path, Math.max(0, playheadUs - clip.startUs));
  return typeof v === "object" && !Array.isArray(v) && "r" in v ? v : undefined;
}

/** A colour with its ◆: editing an animated colour writes a keyframe, otherwise the stored colour. */
export function ColorRow({
  label,
  field,
  item,
  playheadUs,
  stored,
  write,
  onChange,
}: ColorRowProps) {
  const clip = item.clip;
  const shown = animated(clip, field.animation?.path, playheadUs) ??
    stored ?? { r: 1, g: 1, b: 1, a: 1 };
  return (
    <div className="grid grid-cols-[1.25rem_6rem_1fr] items-center gap-2 text-xs">
      <span className="flex justify-center">
        {field.animation !== undefined && (
          <KeyframeToggle
            label={label}
            state={keyStateOf(field, clip, playheadUs)}
            enabled={playheadOnClip(clip, playheadUs)}
            onToggle={() => {
              const ops = keyframeToggleOps(field, [item], playheadUs);
              const only = ops[0];
              if (only !== undefined) {
                onChange(
                  ops.length === 1 ? only : { type: "batch", label: "Toggle keyframe", ops },
                  undefined,
                );
              }
            }}
          />
        )}
      </span>
      <span className="text-neutral-300">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={label}
          value={colorToHex(shown)}
          onChange={(e) => {
            const next = hexToColor(e.target.value, shown.a);
            onChange(
              animatedSetOp(field, clip, playheadUs, next) ?? write(next),
              `inspector:${field.id}`,
            );
          }}
          className="h-6 w-12 cursor-pointer rounded border border-neutral-700 bg-neutral-950"
        />
        <input
          type="range"
          aria-label={`${label} opacity`}
          title="Opacity"
          min={0}
          max={100}
          value={Math.round(shown.a * 100)}
          onChange={(e) => {
            const next = { ...shown, a: Number(e.target.value) / 100 };
            onChange(
              animatedSetOp(field, clip, playheadUs, next) ?? write(next),
              `inspector:${field.id}:a`,
            );
          }}
          className="flex-1 accent-sky-500"
        />
      </div>
    </div>
  );
}
