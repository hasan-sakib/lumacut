import type { Keyframe, KeyframeValue, Vec2 } from "@lumacut/schema";
import { cubic, solveForX, splitCubic, type Cubic, type Point } from "./bezier.ts";
import { colorFromLinear, colorToLinear, isColor, isPath, isVec2, type Linear4 } from "./values.ts";

/** Default ease: a third of the segment with the average speed, which is exactly linear motion. */
const DEFAULT_INFLUENCE = 100 / 3;
const ARC_SAMPLES = 96;

/**
 * The way a segment between two keyframes moves: a "distance" coordinate that runs from 0 to
 * `length` (signed value difference for numbers, path length for points, linear-light distance for
 * colours, 1 for shapes) and the value at any distance. Easing shapes how distance grows with time.
 */
export interface Geometry {
  length: number;
  at: (distance: number) => KeyframeValue;
  /** Cuts the geometry at `distance`: the keyframe fields that change. Only points have spatial tangents. */
  splitSpatial?: (distance: number) => {
    out0: Vec2;
    in1: Vec2;
    boundaryIn: Vec2;
    boundaryOut: Vec2;
  };
}

const zero: Vec2 = [0, 0];
const sub = (a: Point, b: Point): Vec2 => [a[0] - b[0], a[1] - b[1]];
const add = (a: Point, b: Point): Vec2 => [a[0] + b[0], a[1] + b[1]];

function vec2Geometry(k0: Keyframe, k1: Keyframe, v0: Vec2, v1: Vec2): Geometry {
  const out = k0.spatialTangents?.out ?? zero;
  const into = k1.spatialTangents?.in ?? zero;
  const straight = out[0] === 0 && out[1] === 0 && into[0] === 0 && into[1] === 0;
  if (straight) {
    const dx = v1[0] - v0[0];
    const dy = v1[1] - v0[1];
    const length = Math.hypot(dx, dy);
    return {
      length,
      at: (d) => (length === 0 ? v0 : [v0[0] + (dx * d) / length, v0[1] + (dy * d) / length]),
      splitSpatial: () => ({ out0: zero, in1: zero, boundaryIn: zero, boundaryOut: zero }),
    };
  }
  const curve: Cubic = [v0, add(v0, out), add(v1, into), v1];
  // Arc-length table so distance (not the curve parameter) drives the motion.
  const table: number[] = [0];
  let previous: Point = v0;
  for (let i = 1; i <= ARC_SAMPLES; i++) {
    const u = i / ARC_SAMPLES;
    const p: Point = [cubic(...coords(curve, 0), u), cubic(...coords(curve, 1), u)];
    table.push((table[i - 1] ?? 0) + Math.hypot(p[0] - previous[0], p[1] - previous[1]));
    previous = p;
  }
  const length = table[ARC_SAMPLES] ?? 0;
  const paramAt = (distance: number): number => {
    const d = Math.min(length, Math.max(0, distance));
    let low = 0;
    let high = ARC_SAMPLES;
    while (high - low > 1) {
      const middle = (low + high) >> 1;
      if ((table[middle] ?? 0) <= d) low = middle;
      else high = middle;
    }
    const a = table[low] ?? 0;
    const b = table[high] ?? a;
    const f = b > a ? (d - a) / (b - a) : 0;
    return (low + f) / ARC_SAMPLES;
  };
  return {
    length,
    at: (d) => {
      const u = paramAt(d);
      return [cubic(...coords(curve, 0), u), cubic(...coords(curve, 1), u)];
    },
    splitSpatial: (distance) => {
      const [left, right] = splitCubic(curve, paramAt(distance));
      const boundary = left[3];
      return {
        out0: sub(left[1], left[0]),
        in1: sub(right[2], right[3]),
        boundaryIn: sub(left[2], boundary),
        boundaryOut: sub(right[1], boundary),
      };
    },
  };
}

function coords(curve: Cubic, axis: 0 | 1): [number, number, number, number] {
  return [curve[0][axis], curve[1][axis], curve[2][axis], curve[3][axis]];
}

function lerp(a: number, b: number, f: number): number {
  return a + (b - a) * f;
}

export function geometryOf(k0: Keyframe, k1: Keyframe): Geometry {
  const a = k0.value;
  const b = k1.value;
  if (typeof a === "number" && typeof b === "number") {
    return { length: b - a, at: (d) => a + d };
  }
  if (isVec2(a) && isVec2(b)) return vec2Geometry(k0, k1, a, b);
  if (isColor(a) && isColor(b)) {
    const la = colorToLinear(a);
    const lb = colorToLinear(b);
    const length = Math.hypot(lb[0] - la[0], lb[1] - la[1], lb[2] - la[2], lb[3] - la[3]);
    return {
      length,
      at: (d) => {
        const f = length === 0 ? 0 : d / length;
        const mixed: Linear4 = [
          lerp(la[0], lb[0], f),
          lerp(la[1], lb[1], f),
          lerp(la[2], lb[2], f),
          lerp(la[3], lb[3], f),
        ];
        return colorFromLinear(mixed);
      },
    };
  }
  if (isPath(a) && isPath(b)) {
    const compatible = a.closed === b.closed && a.vertices.length === b.vertices.length;
    return {
      length: 1,
      at: (d) => {
        if (!compatible) return d >= 1 ? b : a;
        return {
          closed: a.closed,
          vertices: a.vertices.map((va, i) => {
            const vb = b.vertices[i];
            if (vb === undefined) return va;
            const mix = (p: Vec2, q: Vec2): Vec2 => [lerp(p[0], q[0], d), lerp(p[1], q[1], d)];
            return {
              point: mix(va.point, vb.point),
              inTangent: mix(va.inTangent, vb.inTangent),
              outTangent: mix(va.outTangent, vb.outTangent),
            };
          }),
        };
      },
    };
  }
  // Values of different kinds can't be blended: hold the first until the second arrives.
  return { length: 0, at: () => a };
}

/** The temporal curve of one bezier segment, in (seconds, distance) space. */
export interface TemporalCurve {
  seconds: number;
  length: number;
  curve: Cubic;
}

export function temporalCurve(k0: Keyframe, k1: Keyframe, length: number): TemporalCurve {
  const seconds = (k1.tUs - k0.tUs) / 1e6;
  const average = seconds > 0 ? length / seconds : 0;
  const out = k0.easeOut ?? { influence: DEFAULT_INFLUENCE, speed: average };
  const into = k1.easeIn ?? { influence: DEFAULT_INFLUENCE, speed: average };
  const a = (out.influence / 100) * seconds;
  const b = (into.influence / 100) * seconds;
  return {
    seconds,
    length,
    curve: [
      [0, 0],
      [a, out.speed * a],
      [seconds - b, length - into.speed * b],
      [seconds, length],
    ],
  };
}

/** Distance covered after `elapsedSeconds` of a bezier segment. */
export function distanceAt(t: TemporalCurve, elapsedSeconds: number): number {
  const [p0, p1, p2, p3] = t.curve;
  const u = solveForX(p0[0], p1[0], p2[0], p3[0], elapsedSeconds);
  return cubic(p0[1], p1[1], p2[1], p3[1], u);
}

/** The value at `tUs` (clip-local) of one property's keyframes, sorted by time; undefined when empty. */
export function evaluateFrames(
  frames: readonly Keyframe[],
  tUs: number,
): KeyframeValue | undefined {
  const first = frames[0];
  if (first === undefined) return undefined;
  if (tUs <= first.tUs) return first.value;
  const last = frames[frames.length - 1] ?? first;
  if (tUs >= last.tUs) return last.value;
  let low = 0;
  let high = frames.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if ((frames[middle]?.tUs ?? 0) <= tUs) low = middle;
    else high = middle;
  }
  const k0 = frames[low];
  const k1 = frames[high];
  if (k0 === undefined || k1 === undefined) return last.value;
  if (k0.interpolation === "hold") return k0.value;
  const span = k1.tUs - k0.tUs;
  const geometry = geometryOf(k0, k1);
  if (geometry.length === 0) return k0.value;
  if (k0.interpolation === "linear") {
    return geometry.at((geometry.length * (tUs - k0.tUs)) / span);
  }
  const curve = temporalCurve(k0, k1, geometry.length);
  return geometry.at(distanceAt(curve, (tUs - k0.tUs) / 1e6));
}

/** One bezier segment as the graph editor needs it: its size, and its ease handles with defaults filled in. */
export interface SegmentInfo {
  /** Signed value change for numbers; path length / colour distance / 1 for the others. */
  length: number;
  seconds: number;
  easeOut: { influence: number; speed: number };
  easeIn: { influence: number; speed: number };
}

export function segmentInfo(k0: Keyframe, k1: Keyframe): SegmentInfo {
  const length = geometryOf(k0, k1).length;
  const seconds = (k1.tUs - k0.tUs) / 1e6;
  const average = seconds > 0 ? length / seconds : 0;
  return {
    length,
    seconds,
    easeOut: k0.easeOut ?? { influence: DEFAULT_INFLUENCE, speed: average },
    easeIn: k1.easeIn ?? { influence: DEFAULT_INFLUENCE, speed: average },
  };
}

/**
 * Speed (units of distance per second; signed for numbers) of a property over time, sampled
 * `perSegment` times per segment plus the end: what the speed graph draws. Hold segments are 0.
 */
export function speedProfile(
  frames: readonly Keyframe[],
  perSegment: number,
): { tUs: number; speed: number }[] {
  const points: { tUs: number; speed: number }[] = [];
  for (let i = 0; i + 1 < frames.length; i++) {
    const k0 = frames[i];
    const k1 = frames[i + 1];
    if (k0 === undefined || k1 === undefined) continue;
    const span = k1.tUs - k0.tUs;
    const geometry = geometryOf(k0, k1);
    const curve = temporalCurve(k0, k1, geometry.length);
    for (let s = 0; s <= perSegment; s++) {
      const f = s / perSegment;
      const tUs = k0.tUs + span * f;
      let speed = 0;
      if (k0.interpolation === "linear")
        speed = curve.seconds > 0 ? geometry.length / curve.seconds : 0;
      else if (k0.interpolation === "bezier") {
        const h = Math.max(1e-4, curve.seconds * 1e-3);
        const a = Math.max(0, f * curve.seconds - h);
        const b = Math.min(curve.seconds, f * curve.seconds + h);
        speed = b > a ? (distanceAt(curve, b) - distanceAt(curve, a)) / (b - a) : 0;
      }
      points.push({ tUs, speed });
    }
  }
  return points;
}
