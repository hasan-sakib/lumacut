import type { Clip, Keyframe, KeyframeValue } from "@lumacut/schema";
import { splitCubic, type Cubic } from "./bezier.ts";
import { resolveProperty } from "./paths.ts";
import { evaluateFrames, geometryOf, temporalCurve } from "./segment.ts";

const slope = (dy: number, dx: number, fallback: number): number =>
  dx > 1e-12 ? dy / dx : fallback;

/**
 * Cuts one property's keyframes at `offsetUs` (clip-local). A segment that spans the cut gets a
 * keyframe at the cut on both sides, with its curve split so each half traces exactly what the
 * original did there. Times in the tail are shifted by `−offsetUs`.
 */
export function splitFrames(
  frames: readonly Keyframe[],
  offsetUs: number,
): { head: Keyframe[]; tail: Keyframe[] } {
  const shift = (k: Keyframe): Keyframe => ({ ...k, tUs: k.tUs - offsetUs });
  const crossing = frames.findIndex(
    (k, i) => k.tUs < offsetUs && (frames[i + 1]?.tUs ?? -1) > offsetUs,
  );
  const k0 = frames[crossing];
  const k1 = frames[crossing + 1];
  if (crossing < 0 || k0 === undefined || k1 === undefined) {
    return {
      head: frames.filter((k) => k.tUs <= offsetUs).map((k) => ({ ...k })),
      tail: frames.filter((k) => k.tUs >= offsetUs).map(shift),
    };
  }

  const before = frames.slice(0, crossing);
  const after = frames.slice(crossing + 2);
  const boundaryValue = evaluateFrames(frames, offsetUs) ?? k0.value;

  if (k0.interpolation !== "bezier") {
    const boundary: Keyframe = {
      tUs: offsetUs,
      value: boundaryValue,
      interpolation: k0.interpolation,
    };
    const head: Keyframe = { ...k0 };
    return {
      head: [...before, head, { ...boundary }],
      tail: [shift(boundary), shift(k1), ...after.map(shift)],
    };
  }

  const geometry = geometryOf(k0, k1);
  if (geometry.length === 0) {
    const boundary: Keyframe = { tUs: offsetUs, value: boundaryValue, interpolation: "linear" };
    return {
      head: [...before, { ...k0 }, { ...boundary }],
      tail: [shift(boundary), shift(k1), ...after.map(shift)],
    };
  }
  const temporal = temporalCurve(k0, k1, geometry.length);
  const elapsed = (offsetUs - k0.tUs) / 1e6;
  const [p0, p1, p2, p3] = temporal.curve;
  // Where the cut falls on the temporal curve (u from x = elapsed seconds).
  const u = (() => {
    let low = 0;
    let high = 1;
    for (let i = 0; i < 80; i++) {
      const middle = (low + high) / 2;
      const x = splitCubic(temporal.curve, middle)[0][3][0];
      if (x > elapsed) high = middle;
      else low = middle;
    }
    return (low + high) / 2;
  })();
  const [left, right]: [Cubic, Cubic] = splitCubic([p0, p1, p2, p3], u);
  const leftSeconds = left[3][0];
  const rightSeconds = temporal.seconds - leftSeconds;
  const cutDistance = left[3][1];
  const avgLeft = leftSeconds > 0 ? cutDistance / leftSeconds : 0;
  const avgRight = rightSeconds > 0 ? (geometry.length - cutDistance) / rightSeconds : 0;

  const easeOut0 = {
    influence: leftSeconds > 0 ? (left[1][0] / leftSeconds) * 100 : 0,
    speed: slope(left[1][1], left[1][0], avgLeft),
  };
  const boundaryIn = {
    influence: leftSeconds > 0 ? ((left[3][0] - left[2][0]) / leftSeconds) * 100 : 0,
    speed: slope(left[3][1] - left[2][1], left[3][0] - left[2][0], avgLeft),
  };
  const boundaryOut = {
    influence: rightSeconds > 0 ? ((right[1][0] - right[0][0]) / rightSeconds) * 100 : 0,
    speed: slope(right[1][1] - right[0][1], right[1][0] - right[0][0], avgRight),
  };
  const easeIn1 = {
    influence: rightSeconds > 0 ? ((right[3][0] - right[2][0]) / rightSeconds) * 100 : 0,
    speed: slope(right[3][1] - right[2][1], right[3][0] - right[2][0], avgRight),
  };

  const spatial = geometry.splitSpatial?.(cutDistance);
  const withSpatial = (
    base: Keyframe,
    tangents: { in?: [number, number]; out?: [number, number] },
  ): Keyframe => {
    if (spatial === undefined) return base;
    const previous = base.spatialTangents;
    return {
      ...base,
      spatialTangents: {
        in: tangents.in ?? previous?.in ?? [0, 0],
        out: tangents.out ?? previous?.out ?? [0, 0],
      },
    };
  };

  const headLast: Keyframe = withSpatial({ ...k0, easeOut: easeOut0 }, { out: spatial?.out0 });
  const boundaryHead: Keyframe = withSpatial(
    {
      tUs: offsetUs,
      value: boundaryValue,
      interpolation: "bezier",
      easeIn: boundaryIn,
      easeOut: boundaryOut,
    },
    { in: spatial?.boundaryIn, out: spatial?.boundaryOut },
  );
  const tailFirst = withSpatial({ ...k1, easeIn: easeIn1 }, { in: spatial?.in1 });
  return {
    head: [...before, headLast, { ...boundaryHead }],
    tail: [shift(boundaryHead), shift(tailFirst), ...after.map(shift)],
  };
}

/**
 * Splits every keyframed property of `clip` at `offsetUs` into the two halves' keyframes. A half
 * that ends up with no keyframes for a property keeps it constant at the value it had there
 * (written into the clip's static value, which is otherwise ignored once a property is animated).
 */
export function splitClipKeyframes(
  clip: Clip,
  first: Clip,
  second: Clip,
  offsetUs: number,
): [Clip, Clip] {
  let head: Clip = { ...first, keyframes: {} };
  let tail: Clip = { ...second, keyframes: {} };
  for (const [path, frames] of Object.entries(clip.keyframes)) {
    if (frames.length === 0) continue;
    const parts = splitFrames(frames, offsetUs);
    const property = resolveProperty(clip, path);
    if (parts.head.length > 0) head.keyframes[path] = parts.head;
    else if (property !== undefined) head = property.set(head, constant(frames, offsetUs));
    if (parts.tail.length > 0) tail.keyframes[path] = parts.tail;
    else if (property !== undefined) tail = property.set(tail, constant(frames, offsetUs));
  }
  return [head, tail];
}

function constant(frames: readonly Keyframe[], atUs: number): KeyframeValue {
  return evaluateFrames(frames, atUs) ?? 0; // never empty here
}
