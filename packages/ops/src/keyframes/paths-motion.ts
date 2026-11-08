import type { Clip, KeyframeValue, Mask, ShapeItem, TextAnimator, Vec2 } from "@lumacut/schema";
import type { AnimatableProperty } from "./paths.ts";
import { isPath, type ValueKind } from "./values.ts";

/**
 * The motion-graphics part of the keyframe vocabulary (the rest is in paths.ts):
 * `masks.<id>.{path,feather,expansion,opacity}`,
 * `shape.fill.color`, `shape.stroke.{color,width}`, `shape.trim.{start,end,offset}`,
 * `shape.roundCorners`, `shape.items.<id>.<property>`,
 * `text.animators.<id>.range.{start,end,offset}`,
 * `text.animators.<id>.props.{opacity,rotation,blur,tracking,position,scale,fillColor}` and
 * `motionBlur.shutterAngle`.
 */

const ITEM_PROPS: Record<ShapeItem["kind"], Record<string, ValueKind>> = {
  rect: { position: "vec2", size: "vec2", roundness: "number" },
  ellipse: { position: "vec2", size: "vec2" },
  polygon: {
    position: "vec2",
    points: "number",
    radius: "number",
    roundness: "number",
    rotation: "number",
  },
  star: {
    position: "vec2",
    points: "number",
    innerRadius: "number",
    outerRadius: "number",
    innerRoundness: "number",
    outerRoundness: "number",
    rotation: "number",
  },
  path: { path: "path" },
};

const ANIMATOR_PROPS: Record<string, ValueKind> = {
  opacity: "number",
  rotation: "number",
  blur: "number",
  tracking: "number",
  position: "vec2",
  scale: "vec2",
  fillColor: "color",
};

const num = (v: KeyframeValue): number => (typeof v === "number" ? v : 0);
const pair = (v: KeyframeValue): Vec2 => (Array.isArray(v) ? [v[0], v[1]] : [0, 0]);

function prop(
  path: string,
  kind: ValueKind,
  get: (clip: Clip) => KeyframeValue | undefined,
  set: (clip: Clip, value: KeyframeValue) => Clip,
  fallback: KeyframeValue,
): AnimatableProperty {
  return { path, kind, get: (c) => get(c) ?? fallback, set, drives: [path] };
}

/** Writes `value` into the field `key` of the mask `id` (numbers only). */
const withMask = (clip: Clip, id: string, change: (m: Mask) => Mask): Clip => ({
  ...clip,
  masks: clip.masks.map((m) => (m.id === id ? change(m) : m)),
});

const withItem = (clip: Clip, id: string, change: (item: ShapeItem) => ShapeItem): Clip =>
  clip.shape === undefined
    ? clip
    : {
        ...clip,
        shape: { ...clip.shape, items: clip.shape.items.map((i) => (i.id === id ? change(i) : i)) },
      };

const withAnimator = (clip: Clip, id: string, change: (a: TextAnimator) => TextAnimator): Clip =>
  clip.text === undefined
    ? clip
    : {
        ...clip,
        text: {
          ...clip.text,
          animators: clip.text.animators.map((a) => (a.id === id ? change(a) : a)),
        },
      };

export function resolveMotionProperty(
  clip: Clip,
  parts: readonly string[],
): AnimatableProperty | undefined {
  const [head, a, b, c, d] = parts;
  const path = parts.join(".");

  if (head === "motionBlur" && a === "shutterAngle" && b === undefined) {
    return prop(
      path,
      "number",
      (k) => k.motionBlur.shutterAngle,
      (k, v) => ({ ...k, motionBlur: { ...k.motionBlur, shutterAngle: num(v) } }),
      180,
    );
  }

  if (head === "masks" && a !== undefined && b !== undefined && c === undefined) {
    const mask = clip.masks.find((m) => m.id === a);
    if (mask === undefined) return undefined;
    if (b === "path" && mask.kind === "path") {
      return prop(
        path,
        "path",
        (k) => {
          const m = k.masks.find((x) => x.id === a);
          return m?.kind === "path" ? m.path : undefined;
        },
        (k, v) =>
          isPath(v) ? withMask(k, a, (m) => (m.kind === "path" ? { ...m, path: v } : m)) : k,
        mask.path,
      );
    }
    if (b === "feather" || b === "expansion" || b === "opacity") {
      return prop(
        path,
        "number",
        (k) => k.masks.find((x) => x.id === a)?.[b],
        (k, v) => withMask(k, a, (m) => ({ ...m, [b]: num(v) })),
        mask[b],
      );
    }
    return undefined;
  }

  if (head === "shape" && clip.shape !== undefined) {
    const shape = clip.shape;
    if (a === "fill" && b === "color" && c === undefined && shape.fill !== undefined) {
      return prop(
        path,
        "color",
        (k) => k.shape?.fill?.color,
        (k, v) =>
          k.shape?.fill === undefined || typeof v !== "object" || Array.isArray(v) || isPath(v)
            ? k
            : { ...k, shape: { ...k.shape, fill: { ...k.shape.fill, color: v } } },
        shape.fill.color,
      );
    }
    if (a === "stroke" && shape.stroke !== undefined && c === undefined) {
      if (b === "color") {
        return prop(
          path,
          "color",
          (k) => k.shape?.stroke?.color,
          (k, v) =>
            k.shape?.stroke === undefined || typeof v !== "object" || Array.isArray(v) || isPath(v)
              ? k
              : { ...k, shape: { ...k.shape, stroke: { ...k.shape.stroke, color: v } } },
          shape.stroke.color,
        );
      }
      if (b === "width") {
        return prop(
          path,
          "number",
          (k) => k.shape?.stroke?.width,
          (k, v) =>
            k.shape?.stroke === undefined
              ? k
              : { ...k, shape: { ...k.shape, stroke: { ...k.shape.stroke, width: num(v) } } },
          shape.stroke.width,
        );
      }
      return undefined;
    }
    if (a === "trim" && shape.trimPaths !== undefined && c === undefined) {
      if (b === "start" || b === "end" || b === "offset") {
        return prop(
          path,
          "number",
          (k) => k.shape?.trimPaths?.[b],
          (k, v) =>
            k.shape?.trimPaths === undefined
              ? k
              : { ...k, shape: { ...k.shape, trimPaths: { ...k.shape.trimPaths, [b]: num(v) } } },
          shape.trimPaths[b],
        );
      }
      return undefined;
    }
    if (a === "roundCorners" && b === undefined && shape.roundCorners !== undefined) {
      return prop(
        path,
        "number",
        (k) => k.shape?.roundCorners,
        (k, v) =>
          k.shape === undefined ? k : { ...k, shape: { ...k.shape, roundCorners: num(v) } },
        shape.roundCorners,
      );
    }
    if (a === "items" && b !== undefined && c !== undefined && d === undefined) {
      const item = shape.items.find((i) => i.id === b);
      const kind = item === undefined ? undefined : ITEM_PROPS[item.kind][c];
      if (item === undefined || kind === undefined) return undefined;
      const read = (i: ShapeItem): KeyframeValue | undefined => {
        const value = (i as unknown as Record<string, unknown>)[c];
        if (kind === "number") return typeof value === "number" ? value : undefined;
        if (kind === "vec2") return Array.isArray(value) ? pair(value as KeyframeValue) : undefined;
        return value as KeyframeValue | undefined;
      };
      return prop(
        path,
        kind,
        (k) => {
          const found = k.shape?.items.find((i) => i.id === b);
          return found === undefined ? undefined : read(found);
        },
        (k, v) =>
          withItem(k, b, (i) => ({
            ...i,
            [c]: kind === "number" ? num(v) : kind === "vec2" ? pair(v) : v,
          })),
        read(item) ?? 0,
      );
    }
    return undefined;
  }

  if (head === "text" && a === "animators" && b !== undefined && clip.text !== undefined) {
    const animator = clip.text.animators.find((x) => x.id === b);
    if (animator === undefined) return undefined;
    if (c === "range" && d !== undefined && parts.length === 5) {
      if (d === "start" || d === "end" || d === "offset") {
        return prop(
          path,
          "number",
          (k) => k.text?.animators.find((x) => x.id === b)?.range[d],
          (k, v) => withAnimator(k, b, (x) => ({ ...x, range: { ...x.range, [d]: num(v) } })),
          animator.range[d],
        );
      }
      return undefined;
    }
    if (c === "props" && d !== undefined && parts.length === 5) {
      const kind = ANIMATOR_PROPS[d];
      const current = (animator.props as Record<string, unknown>)[d];
      if (kind === undefined || current === undefined) return undefined;
      return prop(
        path,
        kind,
        (k) =>
          (
            k.text?.animators.find((x) => x.id === b)?.props as Record<string, unknown> | undefined
          )?.[d] as KeyframeValue | undefined,
        (k, v) =>
          withAnimator(k, b, (x) => ({
            ...x,
            props: { ...x.props, [d]: kind === "number" ? num(v) : kind === "vec2" ? pair(v) : v },
          })),
        current as KeyframeValue,
      );
    }
  }
  return undefined;
}
