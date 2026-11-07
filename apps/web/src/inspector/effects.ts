import type {
  ColorParam,
  EffectDefinition,
  NumberParam,
  ParamDef,
  PointParam,
} from "@lumacut/effects";
import type { Color, EffectInstance, Vec2 } from "@lumacut/schema";
import type { ClipInfo, FieldDef } from "./fields.ts";

/** One row of an effect's parameter list in the inspector. */
export type EffectRow =
  { type: "field"; field: FieldDef } | { type: "color"; field: FieldDef; param: ColorParam };

const effectOf = (clip: ClipInfo["clip"], id: string): EffectInstance | undefined =>
  clip.effects.find((e) => e.id === id);

const withParam = (
  clip: ClipInfo["clip"],
  effectId: string,
  param: string,
  value: EffectInstance["params"][string],
): ClipInfo["clip"]["effects"] =>
  clip.effects.map((e) =>
    e.id === effectId ? { ...e, params: { ...e.params, [param]: value } } : e,
  );

const path = (effectId: string, param: string): string => `effects.${effectId}.params.${param}`;

function defaultStep(p: NumberParam | PointParam): number {
  if (p.step !== undefined) return p.step * (p.display ?? 1);
  return Math.max(0.01, Math.round(((p.max - p.min) / 200) * 100) / 100);
}

function numberField(effectId: string, p: NumberParam): FieldDef {
  const display = p.display ?? 1;
  return {
    id: `fx:${effectId}:${p.id}`,
    label: p.label,
    section: "effects",
    keywords: [p.label],
    kind: "number",
    ...(p.unit === undefined ? {} : { unit: p.unit }),
    step: defaultStep(p),
    min: p.min * display,
    max: p.max * display,
    ...(display === 1
      ? {}
      : { toDisplay: (v: number) => v * display, fromDisplay: (v: number) => v / display }),
    animation: { path: path(effectId, p.id) },
    appliesTo: ({ clip }) => effectOf(clip, effectId) !== undefined,
    get: (clip) => {
      const v = effectOf(clip, effectId)?.params[p.id];
      return typeof v === "number" ? v : p.default;
    },
    set: (clip, value) => ({
      props: {
        effects: withParam(
          clip,
          effectId,
          p.id,
          p.type === "int" ? Math.round(Number(value)) : Number(value),
        ),
      },
    }),
  };
}

function pointFields(effectId: string, p: PointParam): FieldDef[] {
  const display = p.display ?? 1;
  return (["X", "Y"] as const).map((axis, index) => ({
    id: `fx:${effectId}:${p.id}:${axis}`,
    label: `${p.label} ${axis}`,
    section: "effects" as const,
    keywords: [p.label],
    kind: "number" as const,
    ...(p.unit === undefined ? {} : { unit: p.unit }),
    step: defaultStep(p),
    min: p.min * display,
    max: p.max * display,
    ...(display === 1
      ? {}
      : { toDisplay: (v: number) => v * display, fromDisplay: (v: number) => v / display }),
    animation: { path: path(effectId, p.id), component: index as 0 | 1 },
    appliesTo: ({ clip }: ClipInfo) => effectOf(clip, effectId) !== undefined,
    get: (clip) => {
      const v = effectOf(clip, effectId)?.params[p.id];
      return (Array.isArray(v) ? v[index] : undefined) ?? p.default[index] ?? 0;
    },
    set: (clip, value) => {
      const current = effectOf(clip, effectId)?.params[p.id];
      const next: Vec2 = Array.isArray(current)
        ? [current[0], current[1]]
        : [p.default[0], p.default[1]];
      next[index] = Number(value);
      return { props: { effects: withParam(clip, effectId, p.id, next) } };
    },
  }));
}

function colorField(effectId: string, p: ColorParam): FieldDef {
  return {
    id: `fx:${effectId}:${p.id}`,
    label: p.label,
    section: "effects",
    keywords: [p.label],
    kind: "number",
    animation: { path: path(effectId, p.id) },
    appliesTo: ({ clip }) => effectOf(clip, effectId) !== undefined,
    get: () => 0,
    set: (clip) => ({ props: { effects: clip.effects } }),
  };
}

function rowsFor(effectId: string, p: ParamDef): EffectRow[] {
  switch (p.type) {
    case "number":
    case "int":
      return [{ type: "field", field: numberField(effectId, p) }];
    case "vec2":
      return pointFields(effectId, p).map((field) => ({ type: "field", field }));
    case "boolean":
      return [
        {
          type: "field",
          field: {
            id: `fx:${effectId}:${p.id}`,
            label: p.label,
            section: "effects",
            keywords: [p.label],
            kind: "boolean",
            appliesTo: ({ clip }) => effectOf(clip, effectId) !== undefined,
            get: (clip) => {
              const v = effectOf(clip, effectId)?.params[p.id];
              return typeof v === "boolean" ? v : p.default;
            },
            set: (clip, value) => ({
              props: { effects: withParam(clip, effectId, p.id, value === true) },
            }),
          },
        },
      ];
    case "enum":
      return [
        {
          type: "field",
          field: {
            id: `fx:${effectId}:${p.id}`,
            label: p.label,
            section: "effects",
            keywords: [p.label],
            kind: "enum",
            options: p.options.map((o) => o.value),
            optionLabels: Object.fromEntries(p.options.map((o) => [o.value, o.label])),
            appliesTo: ({ clip }) => effectOf(clip, effectId) !== undefined,
            get: (clip) => {
              const v = effectOf(clip, effectId)?.params[p.id];
              return typeof v === "string" ? v : p.default;
            },
            set: (clip, value) => ({
              props: { effects: withParam(clip, effectId, p.id, String(value)) },
            }),
          },
        },
      ];
    case "color":
      return [{ type: "color", field: colorField(effectId, p), param: p }];
  }
}

/** The inspector rows for one effect instance, generated from its parameter definitions. */
export function effectRows(instance: EffectInstance, def: EffectDefinition): EffectRow[] {
  return def.params.flatMap((p) => rowsFor(instance.id, p));
}

/** The colour a parameter currently holds (before animation), or its default. */
export function colorParamValue(instance: EffectInstance, param: ColorParam): Color {
  const v = instance.params[param.id];
  return typeof v === "object" && !Array.isArray(v) && "r" in v ? v : param.default;
}

/** `#rrggbb` for an `<input type="color">`, and back (alpha is kept separately). */
export function colorToHex(c: Color): string {
  const h = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}

export function hexToColor(hex: string, alpha: number): Color {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a: alpha };
}
