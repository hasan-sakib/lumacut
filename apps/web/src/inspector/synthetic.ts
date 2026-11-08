import type { Clip, ClipPatch, Vec2 } from "@lumacut/schema";
import type { ClipInfo, FieldAnimation, FieldDef, FieldValue } from "./fields.ts";

/**
 * Builders for inspector fields that aren't in the static catalogue because they belong to one
 * item of a clip (a shape item, a mask, a text animator): they read and write through functions
 * the caller supplies and animate through a property path.
 */
export interface NumberSpec {
  id: string;
  label: string;
  /** Does this clip have the thing the field edits? */
  has: (clip: Clip) => boolean;
  read: (clip: Clip) => number | undefined;
  write: (clip: Clip, value: number) => ClipPatch;
  /** The keyframe path, when the value can be animated. */
  path?: string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  /** Shown value = stored × display (percentages: 100). */
  display?: number;
  fallback?: number;
}

export function numberField(spec: NumberSpec): FieldDef {
  const display = spec.display ?? 1;
  const animation: FieldAnimation | undefined =
    spec.path === undefined ? undefined : { path: spec.path };
  return {
    id: spec.id,
    label: spec.label,
    section: "effects",
    keywords: [spec.label],
    kind: "number",
    ...(spec.unit === undefined ? {} : { unit: spec.unit }),
    step: spec.step ?? 1,
    ...(spec.min === undefined ? {} : { min: spec.min * display }),
    ...(spec.max === undefined ? {} : { max: spec.max * display }),
    ...(display === 1
      ? {}
      : { toDisplay: (v: number) => v * display, fromDisplay: (v: number) => v / display }),
    ...(animation === undefined ? {} : { animation }),
    appliesTo: ({ clip }: ClipInfo) => spec.has(clip),
    get: (clip) => spec.read(clip) ?? spec.fallback ?? 0,
    set: (clip, value: FieldValue) => ({ props: spec.write(clip, Number(value)) }),
  };
}

export interface PointSpec {
  id: string;
  label: string;
  has: (clip: Clip) => boolean;
  read: (clip: Clip) => Vec2 | undefined;
  write: (clip: Clip, value: Vec2) => ClipPatch;
  path?: string;
  step?: number;
  unit?: string;
  min?: number;
  max?: number;
  display?: number;
}

/** Two number fields (X and Y) over one point property; they share its keyframe track. */
export function pointFields(spec: PointSpec): FieldDef[] {
  return ([0, 1] as const)
    .map((index) => {
      const axis = index === 0 ? "X" : "Y";
      return numberField({
        id: `${spec.id}:${axis}`,
        label: `${spec.label} ${axis}`,
        has: spec.has,
        read: (clip) => spec.read(clip)?.[index],
        write: (clip, value) => {
          const current = spec.read(clip) ?? [0, 0];
          const next: Vec2 = [current[0], current[1]];
          next[index] = value;
          return spec.write(clip, next);
        },
        ...(spec.step === undefined ? {} : { step: spec.step }),
        ...(spec.unit === undefined ? {} : { unit: spec.unit }),
        ...(spec.min === undefined ? {} : { min: spec.min }),
        ...(spec.max === undefined ? {} : { max: spec.max }),
        ...(spec.display === undefined ? {} : { display: spec.display }),
      }) satisfies FieldDef;
    })
    .map((field, index) =>
      spec.path === undefined
        ? field
        : { ...field, animation: { path: spec.path, component: index as 0 | 1 } },
    );
}

export interface ChoiceSpec {
  id: string;
  label: string;
  options: readonly { value: string; label: string }[];
  has: (clip: Clip) => boolean;
  read: (clip: Clip) => string | undefined;
  write: (clip: Clip, value: string) => ClipPatch;
}

export function choiceField(spec: ChoiceSpec): FieldDef {
  return {
    id: spec.id,
    label: spec.label,
    section: "effects",
    keywords: [spec.label],
    kind: "enum",
    options: spec.options.map((o) => o.value),
    optionLabels: Object.fromEntries(spec.options.map((o) => [o.value, o.label])),
    appliesTo: ({ clip }) => spec.has(clip),
    get: (clip) => spec.read(clip) ?? spec.options[0]?.value ?? "",
    set: (clip, value) => ({ props: spec.write(clip, String(value)) }),
  };
}

export interface FlagSpec {
  id: string;
  label: string;
  has: (clip: Clip) => boolean;
  read: (clip: Clip) => boolean;
  write: (clip: Clip, value: boolean) => ClipPatch;
}

export function flagField(spec: FlagSpec): FieldDef {
  return {
    id: spec.id,
    label: spec.label,
    section: "effects",
    keywords: [spec.label],
    kind: "boolean",
    appliesTo: ({ clip }) => spec.has(clip),
    get: (clip) => spec.read(clip),
    set: (clip, value) => ({ props: spec.write(clip, value === true) }),
  };
}

/** A colour field's animation hook (colours are edited with a colour input, not a number row). */
export function colorKeyField(
  id: string,
  label: string,
  path: string,
  has: (clip: Clip) => boolean,
): FieldDef {
  return {
    id,
    label,
    section: "effects",
    keywords: [label],
    kind: "number",
    animation: { path },
    appliesTo: ({ clip }) => has(clip),
    get: () => 0,
    set: (clip) => ({ props: { shape: clip.shape } }),
  };
}

/** A row in a group of item-level controls (masks, text animators). */
export type ItemRow =
  | { type: "field"; field: FieldDef }
  | {
      type: "color";
      field: FieldDef;
      label: string;
      read: (clip: Clip) => import("@lumacut/schema").Color | undefined;
      write: (clip: Clip, color: import("@lumacut/schema").Color) => ClipPatch;
    }
  | { type: "key"; field: FieldDef; label: string }
  | {
      type: "button";
      label: string;
      description: string;
      /** The op the button runs for this clip (null: nothing to do). */
      op: (clip: Clip) => import("@lumacut/schema").Op | null;
      danger?: boolean;
    };

export interface ItemGroup {
  id: string;
  title: string;
  rows: ItemRow[];
}
