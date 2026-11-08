import type { Clip, Color, Op, RangeShape, TextAnimator, TextData } from "@lumacut/schema";
import {
  choiceField,
  colorKeyField,
  flagField,
  numberField,
  pointFields,
  type ItemGroup,
  type ItemRow,
} from "./synthetic.ts";

type Props = TextAnimator["props"];
type PropKey = keyof Props;

const SHAPES: { value: RangeShape; label: string }[] = [
  { value: "square", label: "Square (all or nothing)" },
  { value: "rampUp", label: "Ramp up" },
  { value: "rampDown", label: "Ramp down" },
  { value: "triangle", label: "Triangle" },
  { value: "round", label: "Round" },
  { value: "smooth", label: "Smooth" },
];

const UNITS = [
  { value: "char", label: "Characters" },
  { value: "word", label: "Words" },
  { value: "line", label: "Lines" },
];

/** A new animator: fade and drop each character in (the typical "text in" look). */
export function newAnimator(id: string): TextAnimator {
  return {
    id,
    unit: "char",
    range: { start: 0, end: 1, offset: 0, shape: "square" },
    props: { opacity: 0, position: [0, 24] },
  };
}

const withText = (
  clip: Clip,
  change: (t: TextData) => TextData,
): { text: TextData } | Record<string, never> =>
  clip.text === undefined ? {} : { text: change(clip.text) };

const mapAnimator = (clip: Clip, id: string, change: (a: TextAnimator) => TextAnimator) =>
  withText(clip, (t) => ({
    ...t,
    animators: t.animators.map((a) => (a.id === id ? change(a) : a)),
  }));

export const addAnimatorOp = (clip: Clip, id: string): Op | null =>
  clip.text === undefined
    ? null
    : {
        type: "setProps",
        clipId: clip.id,
        props: { text: { ...clip.text, animators: [...clip.text.animators, newAnimator(id)] } },
      };

export const removeAnimatorOp = (clip: Clip, id: string): Op | null =>
  clip.text === undefined
    ? null
    : {
        type: "setProps",
        clipId: clip.id,
        props: {
          text: { ...clip.text, animators: clip.text.animators.filter((a) => a.id !== id) },
        },
      };

const DEFAULTS: Record<PropKey, Props[PropKey]> = {
  opacity: 0,
  position: [0, 24],
  scale: [1.5, 1.5],
  rotation: 20,
  blur: 8,
  tracking: 100,
  fillColor: { r: 1, g: 0.84, b: 0.04, a: 1 },
};

/** Inspector groups for a text clip's animators. */
export function animatorGroups(clip: Clip): ItemGroup[] {
  const animators = clip.text?.animators ?? [];
  return animators.map((animator, index): ItemGroup => {
    const id = animator.id;
    const find = (c: Clip) => c.text?.animators.find((a) => a.id === id);
    const has = (c: Clip) => find(c) !== undefined;
    const base = `text.animators.${id}`;
    const f = (field: ReturnType<typeof numberField>): ItemRow => ({ type: "field", field });
    const rows: ItemRow[] = [
      {
        type: "field",
        field: choiceField({
          id: `anim:${id}:unit`,
          label: "Animate",
          options: UNITS,
          has,
          read: (c) => find(c)?.unit,
          write: (c, v) =>
            mapAnimator(c, id, (a) => ({ ...a, unit: v === "word" || v === "line" ? v : "char" })),
        }),
      },
      {
        type: "field",
        field: choiceField({
          id: `anim:${id}:shape`,
          label: "Shape",
          options: SHAPES,
          has,
          read: (c) => find(c)?.range.shape,
          write: (c, v) =>
            mapAnimator(c, id, (a) => ({
              ...a,
              range: { ...a.range, shape: SHAPES.find((s) => s.value === v)?.value ?? "square" },
            })),
        }),
      },
    ];
    for (const key of ["start", "end", "offset"] as const) {
      rows.push(
        f(
          numberField({
            id: `anim:${id}:${key}`,
            label: key === "start" ? "Range start" : key === "end" ? "Range end" : "Range offset",
            has,
            read: (c) => find(c)?.range[key],
            write: (c, v) => mapAnimator(c, id, (a) => ({ ...a, range: { ...a.range, [key]: v } })),
            path: `${base}.range.${key}`,
            ...(key === "offset" ? { step: 1, min: -3, max: 3 } : { step: 1, min: 0, max: 1 }),
            unit: "%",
            display: 100,
          }),
        ),
      );
    }

    const toggle = (key: PropKey, label: string): ItemRow =>
      ({
        type: "field",
        field: flagField({
          id: `anim:${id}:${key}:on`,
          label,
          has,
          read: (c) => find(c)?.props[key] !== undefined,
          write: (c, on) =>
            mapAnimator(c, id, (a) => {
              const { [key]: _removed, ...rest } = a.props;
              return { ...a, props: on ? { ...rest, [key]: DEFAULTS[key] } : rest };
            }),
        }),
      }) satisfies ItemRow;

    const props = animator.props;
    rows.push(toggle("opacity", "Opacity"));
    if (props.opacity !== undefined) {
      rows.push(
        f(
          numberField({
            id: `anim:${id}:opacity`,
            label: "  Opacity",
            has,
            read: (c) => find(c)?.props.opacity,
            write: (c, v) =>
              mapAnimator(c, id, (a) => ({
                ...a,
                props: { ...a.props, opacity: Math.min(1, Math.max(0, v)) },
              })),
            path: `${base}.props.opacity`,
            min: 0,
            max: 1,
            step: 1,
            unit: "%",
            display: 100,
          }),
        ),
      );
    }
    rows.push(toggle("position", "Position"));
    if (props.position !== undefined) {
      rows.push(
        ...pointFields({
          id: `anim:${id}:position`,
          label: "  Offset",
          has,
          read: (c) => find(c)?.props.position,
          write: (c, v) =>
            mapAnimator(c, id, (a) => ({ ...a, props: { ...a.props, position: v } })),
          path: `${base}.props.position`,
          unit: "px",
          step: 1,
        }).map(f),
      );
    }
    rows.push(toggle("scale", "Scale"));
    if (props.scale !== undefined) {
      rows.push(
        ...pointFields({
          id: `anim:${id}:scale`,
          label: "  Scale",
          has,
          read: (c) => find(c)?.props.scale,
          write: (c, v) => mapAnimator(c, id, (a) => ({ ...a, props: { ...a.props, scale: v } })),
          path: `${base}.props.scale`,
          unit: "%",
          step: 1,
          display: 100,
          min: 0,
          max: 10,
        }).map(f),
      );
    }
    for (const [key, label, unit, step, min, max] of [
      ["rotation", "Rotation", "°", 1, -720, 720],
      ["blur", "Blur", "px", 1, 0, 200],
      ["tracking", "Spacing", "", 5, -500, 2000],
    ] as const) {
      rows.push(toggle(key, label));
      if (props[key] !== undefined) {
        rows.push(
          f(
            numberField({
              id: `anim:${id}:${key}`,
              label: `  ${label}`,
              has,
              read: (c) => find(c)?.props[key],
              write: (c, v) =>
                mapAnimator(c, id, (a) => ({ ...a, props: { ...a.props, [key]: v } })),
              path: `${base}.props.${key}`,
              step,
              min,
              max,
              ...(unit === "" ? {} : { unit }),
            }),
          ),
        );
      }
    }
    rows.push(toggle("fillColor", "Colour"));
    if (props.fillColor !== undefined) {
      rows.push({
        type: "color",
        field: colorKeyField(
          `anim:${id}:fillColor`,
          "Animator colour",
          `${base}.props.fillColor`,
          has,
        ),
        label: "  Colour",
        read: (c) => find(c)?.props.fillColor,
        write: (c, color: Color) =>
          mapAnimator(c, id, (a) => ({ ...a, props: { ...a.props, fillColor: color } })),
      });
    }
    rows.push({
      type: "button",
      label: `Remove animator ${String(index + 1)}`,
      description: "Delete this text animator.",
      op: (c) => removeAnimatorOp(c, id),
      danger: true,
    });
    return { id, title: `Animator ${String(index + 1)}`, rows };
  });
}
