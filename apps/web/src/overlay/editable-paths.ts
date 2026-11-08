import { animatedClip } from "@lumacut/ops";
import type { BezierPath, Clip, Composition, Op, Project, Vec2 } from "@lumacut/schema";
import { animatedSetOp } from "../inspector/animation.ts";
import type { ClipInfo, FieldDef } from "../inspector/fields.ts";
import { colorKeyField } from "../inspector/synthetic.ts";
import { layerBoxOf, layerToComp } from "./layer-box.ts";
import { invert, applyToPoint } from "@lumacut/engine";

/** A path the overlay can edit with the pointer, with the maps between its space and composition pixels. */
export interface EditablePath {
  /** Unique within the clip: `mask:<id>` or `item:<id>`. */
  id: string;
  label: string;
  path: BezierPath;
  toComp: (p: Vec2) => Vec2;
  fromComp: (p: Vec2) => Vec2;
  /** Tangents are offsets: they map as vectors. */
  vectorToComp: (v: Vec2) => Vec2;
  vectorFromComp: (v: Vec2) => Vec2;
  /** The op that stores a new path: a keyframe when the path is animated, otherwise the static value. */
  write: (path: BezierPath) => Op | null;
}

/** A field that carries a path's keyframe track (paths are edited on the canvas, not in a number row). */
const pathField = (id: string, path: string): FieldDef =>
  colorKeyField(id, "Path", path, () => true);

/**
 * The editable paths of a clip at the playhead: its path masks (in the clip's picture) and the
 * pen-drawn path items of a shape (in shape space). `info.clip` is the stored clip; positions are
 * evaluated at `playheadUs` so handles sit where the picture is.
 */
export function editablePaths(
  info: ClipInfo,
  project: Project,
  comp: Composition,
  playheadUs: number,
): EditablePath[] {
  const clip = info.clip;
  const local = Math.max(0, playheadUs - clip.startUs);
  const animated = animatedClip(clip, local);
  const box = layerBoxOf(animated, project, comp, local);
  const m = layerToComp(animated, box);
  let inverse: ReturnType<typeof invert>;
  try {
    inverse = invert(m);
  } catch {
    return []; // scaled to nothing: nothing to grab
  }
  const out: EditablePath[] = [];

  const space = (shiftX: number, shiftY: number) => ({
    toComp: (p: Vec2): Vec2 => {
      const q = applyToPoint(m, [p[0] + shiftX, p[1] + shiftY]);
      return [q[0], q[1]];
    },
    fromComp: (p: Vec2): Vec2 => {
      const q = applyToPoint(inverse, p);
      return [q[0] - shiftX, q[1] - shiftY];
    },
    vectorToComp: (v: Vec2): Vec2 => [m[0] * v[0] + m[2] * v[1], m[1] * v[0] + m[3] * v[1]],
    vectorFromComp: (v: Vec2): Vec2 => [
      inverse[0] * v[0] + inverse[2] * v[1],
      inverse[1] * v[0] + inverse[3] * v[1],
    ],
  });

  const animatedPath = (path: string, value: BezierPath): Op | null =>
    (clip.keyframes[path]?.length ?? 0) === 0
      ? null
      : animatedSetOp(pathField(`path:${path}`, path), clip, playheadUs, value);

  animated.masks.forEach((mask, index) => {
    if (mask.kind !== "path") return;
    const keyPath = `masks.${mask.id}.path`;
    out.push({
      id: `mask:${mask.id}`,
      label: `Mask ${String(index + 1)}`,
      path: mask.path,
      ...space(0, 0),
      write: (next) =>
        animatedPath(keyPath, next) ?? {
          type: "updateMask",
          clipId: clip.id,
          maskId: mask.id,
          mask: { ...mask, path: next },
        },
    });
  });

  if (animated.shape !== undefined) {
    const shape = animated.shape;
    for (const item of shape.items) {
      if (item.kind !== "path") continue;
      const keyPath = `shape.items.${item.id}.path`;
      const stored = clip.shape;
      out.push({
        id: `item:${item.id}`,
        label: "Path",
        path: item.path,
        ...space(box.shift.x, box.shift.y),
        write: (next) =>
          animatedPath(keyPath, next) ??
          (stored === undefined
            ? null
            : {
                type: "setProps",
                clipId: clip.id,
                props: {
                  shape: {
                    ...stored,
                    items: stored.items.map((i) =>
                      i.id === item.id && i.kind === "path" ? { ...i, path: next } : i,
                    ),
                  },
                },
              }),
      });
    }
  }
  return out;
}

export type { Clip };
