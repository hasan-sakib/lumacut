import type { Color, RangeShape, TextAnimator, TextAnimatorRange, Vec2 } from "@lumacut/schema";

/**
 * How much of an animator applies to one unit (character, word or line), 0..1, from After
 * Effects-style range selector: the range [start, end] shifted by `offset` along the units
 * (0 = first unit, 1 = last); `position` is where this unit sits along them. Outside the range
 * nothing applies; inside, the shape says how strongly.
 */
export function coverage(range: TextAnimatorRange, position: number): number {
  const start = range.start + range.offset;
  const end = range.end + range.offset;
  if (end <= start) return 0;
  if (position < start || position > end) return 0;
  const t = (position - start) / (end - start);
  switch (range.shape) {
    case "square":
      return 1;
    case "rampUp":
      return t;
    case "rampDown":
      return 1 - t;
    case "triangle":
      return 1 - Math.abs(2 * t - 1);
    case "round":
      return Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2));
    case "smooth":
      return t * t * (3 - 2 * t);
  }
}

export const SHAPES: readonly RangeShape[] = [
  "square",
  "rampUp",
  "rampDown",
  "triangle",
  "round",
  "smooth",
];

/** What the animators do to one unit, combined. */
export interface UnitStyle {
  /** Multiplier on opacity. */
  alpha: number;
  /** Offset in px. */
  dx: number;
  dy: number;
  /** Scale about the unit's centre. */
  sx: number;
  sy: number;
  /** Rotation in degrees (clockwise). */
  rotation: number;
  blur: number;
  /** Extra letter spacing in 1/1000 em, applied after the unit. */
  tracking: number;
  /** A colour to move towards, and how far (0..1). */
  fill: { color: Color; amount: number } | null;
}

export const NEUTRAL_STYLE: UnitStyle = {
  alpha: 1,
  dx: 0,
  dy: 0,
  sx: 1,
  sy: 1,
  rotation: 0,
  blur: 0,
  tracking: 0,
  fill: null,
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Applies one animator's properties at strength `c` on top of `style`. */
export function applyAnimator(
  style: UnitStyle,
  props: TextAnimator["props"],
  c: number,
): UnitStyle {
  if (c <= 0) return style;
  const next = { ...style };
  if (props.opacity !== undefined) next.alpha *= lerp(1, props.opacity, c);
  if (props.position !== undefined) {
    const [x, y]: Vec2 = props.position;
    next.dx += x * c;
    next.dy += y * c;
  }
  if (props.scale !== undefined) {
    next.sx *= lerp(1, props.scale[0], c);
    next.sy *= lerp(1, props.scale[1], c);
  }
  if (props.rotation !== undefined) next.rotation += props.rotation * c;
  if (props.blur !== undefined) next.blur += props.blur * c;
  if (props.tracking !== undefined) next.tracking += props.tracking * c;
  if (props.fillColor !== undefined) next.fill = { color: props.fillColor, amount: c };
  return next;
}

/** All animators' effect on the unit at index `index` of `count` (per unit kind). */
export function styleForUnit(
  animators: readonly TextAnimator[],
  counts: Readonly<Record<"char" | "word" | "line", number>>,
  indexes: Readonly<Record<"char" | "word" | "line", number>>,
): UnitStyle {
  let style = NEUTRAL_STYLE;
  for (const a of animators) {
    const count = counts[a.unit];
    const position = count <= 1 ? 0.5 : (indexes[a.unit] + 0.5) / count;
    style = applyAnimator(style, a.props, coverage(a.range, position));
  }
  return style;
}

/** Mixes the text colour towards an animator's fill colour. */
export function mixColor(base: Color, target: Color, amount: number): Color {
  return {
    r: lerp(base.r, target.r, amount),
    g: lerp(base.g, target.g, amount),
    b: lerp(base.b, target.b, amount),
    a: lerp(base.a, target.a, amount),
  };
}
