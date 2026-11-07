import { effectById } from "@lumacut/effects";
import { evaluate } from "@lumacut/ops";
import type { Clip, Color, Op } from "@lumacut/schema";
import { useState } from "react";
import { colorParamValue, colorToHex, effectRows, hexToColor } from "../../inspector/effects.ts";
import {
  moveEffectOp,
  removeEffectOp,
  resetEffectOp,
  setEffectEnabledOp,
} from "../../inspector/effect-ops.ts";
import {
  animatedSetOp,
  keyframeToggleOps,
  keyStateOf,
  playheadOnClip,
} from "../../inspector/animation.ts";
import type { ClipInfo } from "../../inspector/fields.ts";
import { fieldStateFor, opForField } from "../../inspector/selection.ts";
import { FieldRow } from "../inspector/FieldRow.tsx";
import { Section } from "../inspector/Section.tsx";
import { KeyframeToggle } from "../params/KeyframeToggle.tsx";

interface EffectsInspectorProps {
  item: ClipInfo;
  playheadUs: number;
  onChange: (op: Op, coalesceKey: string | undefined) => void;
}

function IconButton({
  label,
  description,
  disabled,
  onClick,
  children,
}: {
  label: string;
  description: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={`${label}: ${description}`}
      aria-label={label}
      disabled={disabled}
      onMouseDown={(e) => {
        e.preventDefault();
      }}
      onClick={onClick}
      className="rounded px-1.5 py-0.5 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/**
 * The effect stack of one clip. Every effect's controls are generated from its parameter
 * definitions (`@lumacut/effects`), so a new effect needs no UI code.
 */
export function EffectsInspector({ item, playheadUs, onChange }: EffectsInspectorProps) {
  const [open, setOpen] = useState(true);
  const clip: Clip = item.clip;
  const items = [item];
  if (clip.effects.length === 0) return null;
  return (
    <Section
      id="effects"
      title="Effects"
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
      {clip.effects.map((instance, index) => {
        const def = effectById(instance.effectId);
        return (
          <div
            key={instance.id}
            data-effect={instance.id}
            className="flex flex-col gap-2 rounded border border-neutral-800 p-2"
          >
            <div className="flex items-center gap-1">
              <input
                type="checkbox"
                aria-label={`${def?.name ?? instance.effectId} on`}
                title="Turn this effect on or off"
                checked={instance.enabled}
                onChange={(e) => {
                  onChange(setEffectEnabledOp(clip.id, instance.id, e.target.checked), undefined);
                }}
                className="h-4 w-4 accent-sky-500"
              />
              <span className="flex-1 truncate text-xs font-semibold text-neutral-100">
                {def?.name ?? `Unknown effect “${instance.effectId}”`}
              </span>
              <IconButton
                label={`Move ${def?.name ?? "effect"} up`}
                description="Apply it earlier in the stack."
                disabled={index === 0}
                onClick={() => {
                  const op = moveEffectOp(clip, instance.id, -1);
                  if (op !== null) onChange(op, undefined);
                }}
              >
                ↑
              </IconButton>
              <IconButton
                label={`Move ${def?.name ?? "effect"} down`}
                description="Apply it later in the stack."
                disabled={index === clip.effects.length - 1}
                onClick={() => {
                  const op = moveEffectOp(clip, instance.id, 1);
                  if (op !== null) onChange(op, undefined);
                }}
              >
                ↓
              </IconButton>
              <IconButton
                label={`Reset ${def?.name ?? "effect"}`}
                description="Put every setting back to its default."
                disabled={def === undefined}
                onClick={() => {
                  const op = resetEffectOp(clip, instance.id);
                  if (op !== null) onChange(op, undefined);
                }}
              >
                ↺
              </IconButton>
              <IconButton
                label={`Remove ${def?.name ?? "effect"}`}
                description="Take this effect off the clip."
                onClick={() => {
                  onChange(removeEffectOp(clip.id, instance.id), undefined);
                }}
              >
                ✕
              </IconButton>
            </div>
            {def === undefined ? (
              <p className="text-xs text-amber-300">
                This effect isn't known to this version of Lumacut, so it isn't drawn.
              </p>
            ) : (
              effectRows(instance, def).map((row) => {
                if (row.type === "field") {
                  const state = fieldStateFor(row.field, items, playheadUs);
                  return (
                    <FieldRow
                      key={row.field.id}
                      field={state}
                      onChange={(stored, source) => {
                        const op = opForField(row.field, stored, items, playheadUs);
                        if (op !== null) {
                          onChange(
                            op,
                            source === "scrub" || source === "step"
                              ? `inspector:${row.field.id}`
                              : undefined,
                          );
                        }
                      }}
                      onToggleKey={() => {
                        const ops = keyframeToggleOps(row.field, items, playheadUs);
                        const only = ops[0];
                        if (only !== undefined) {
                          onChange(
                            ops.length === 1
                              ? only
                              : { type: "batch", label: "Toggle keyframe", ops },
                            undefined,
                          );
                        }
                      }}
                    />
                  );
                }
                const current = colorParamValue(instance, row.param);
                const shown = animatedColor(clip, row.field.animation?.path, playheadUs) ?? current;
                const state = keyStateOf(row.field, clip, playheadUs);
                return (
                  <div
                    key={row.field.id}
                    className="grid grid-cols-[1.25rem_6rem_1fr] items-center gap-2 text-xs"
                  >
                    <span className="flex justify-center">
                      <KeyframeToggle
                        label={row.param.label}
                        state={state}
                        enabled={playheadOnClip(clip, playheadUs)}
                        onToggle={() => {
                          const ops = keyframeToggleOps(row.field, items, playheadUs);
                          const only = ops[0];
                          if (only !== undefined) {
                            onChange(
                              ops.length === 1
                                ? only
                                : { type: "batch", label: "Toggle keyframe", ops },
                              undefined,
                            );
                          }
                        }}
                      />
                    </span>
                    <span className="text-neutral-300">{row.param.label}</span>
                    <input
                      type="color"
                      aria-label={row.param.label}
                      value={colorToHex(shown)}
                      onChange={(e) => {
                        const next = hexToColor(e.target.value, shown.a);
                        const keyed = animatedSetOp(row.field, clip, playheadUs, next);
                        onChange(
                          keyed ?? {
                            type: "updateEffect",
                            clipId: clip.id,
                            effectId: instance.id,
                            props: { params: { [row.param.id]: next } },
                          },
                          `inspector:${row.field.id}`,
                        );
                      }}
                      className="h-6 w-full cursor-pointer rounded border border-neutral-700 bg-neutral-950"
                    />
                  </div>
                );
              })
            )}
          </div>
        );
      })}
    </Section>
  );
}

function animatedColor(clip: Clip, path: string | undefined, playheadUs: number) {
  if (path === undefined) return undefined;
  const frames = clip.keyframes[path];
  if (frames === undefined || frames.length === 0) return undefined;
  // Evaluate through the ops package so the colour matches what the engine draws.
  return evaluateColor(clip, path, playheadUs);
}

function evaluateColor(clip: Clip, path: string, playheadUs: number): Color | undefined {
  const v = evaluate(clip, path, Math.max(0, playheadUs - clip.startUs));
  return typeof v === "object" && !Array.isArray(v) && "r" in v ? v : undefined;
}
