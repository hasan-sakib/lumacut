import type { BezierPath, Clip, Composition, Mask, Op, PathMask, Project } from "@lumacut/schema";
import {
  choiceField,
  colorKeyField,
  flagField,
  numberField,
  type ItemGroup,
  type ItemRow,
} from "./synthetic.ts";

const KAPPA = 0.5522847498;

/** A closed rectangle path centred on (cx, cy), in layer pixels. */
export function rectPath(cx: number, cy: number, w: number, h: number): BezierPath {
  const hw = w / 2;
  const hh = h / 2;
  const v = (x: number, y: number) => ({
    point: [x, y] as [number, number],
    inTangent: [0, 0] as [number, number],
    outTangent: [0, 0] as [number, number],
  });
  return {
    closed: true,
    vertices: [v(cx - hw, cy - hh), v(cx + hw, cy - hh), v(cx + hw, cy + hh), v(cx - hw, cy + hh)],
  };
}

/** A closed ellipse path (four smooth vertices) centred on (cx, cy). */
export function ellipsePath(cx: number, cy: number, w: number, h: number): BezierPath {
  const rx = w / 2;
  const ry = h / 2;
  const v = (x: number, y: number, tx: number, ty: number) => ({
    point: [x, y] as [number, number],
    inTangent: [-tx, -ty] as [number, number],
    outTangent: [tx, ty] as [number, number],
  });
  return {
    closed: true,
    vertices: [
      v(cx, cy - ry, rx * KAPPA, 0),
      v(cx + rx, cy, 0, ry * KAPPA),
      v(cx, cy + ry, -rx * KAPPA, 0),
      v(cx - rx, cy, 0, -ry * KAPPA),
    ],
  };
}

export const newPathMask = (id: string, path: BezierPath): PathMask => ({
  kind: "path",
  id,
  mode: "add",
  feather: 0,
  expansion: 0,
  opacity: 1,
  inverted: false,
  path,
});

/** The size of a clip's picture in layer pixels (what masks are drawn against), best effort. */
export function layerSizeOf(
  clip: Clip,
  project: Project,
  comp: Composition,
): { width: number; height: number } {
  if (clip.type === "media") {
    const asset = project.assets.find((a) => a.id === clip.assetId);
    const size = asset?.video ?? asset?.image;
    if (size !== undefined) return { width: size.width, height: size.height };
  }
  if (clip.type === "composition") {
    const child = project.compositions.find((c) => c.id === clip.compositionId);
    if (child !== undefined) return { width: child.width, height: child.height };
  }
  return { width: comp.width, height: comp.height };
}

export function addMaskOp(clip: Clip, mask: Mask): Op {
  return { type: "addMask", clipId: clip.id, mask };
}

export const removeMaskOp = (clip: Clip, maskId: string): Op => ({
  type: "removeMask",
  clipId: clip.id,
  maskId,
});

const MODES = [
  { value: "add", label: "Add (show inside)" },
  { value: "subtract", label: "Subtract (cut a hole)" },
  { value: "intersect", label: "Intersect (keep the overlap)" },
] as const;

const withMask = (clip: Clip, id: string, change: (m: Mask) => Mask): { masks: Mask[] } => ({
  masks: clip.masks.map((m) => (m.id === id ? change(m) : m)),
});

/** Inspector groups for a clip's masks. */
export function maskGroups(clip: Clip): ItemGroup[] {
  return clip.masks.map((mask, index): ItemGroup => {
    const has = (c: Clip) => c.masks.some((m) => m.id === mask.id);
    const num = (
      key: "feather" | "expansion" | "opacity",
      label: string,
      opts: { min?: number; max?: number; step?: number; unit?: string; display?: number },
    ): ItemRow => ({
      type: "field",
      field: numberField({
        id: `mask:${mask.id}:${key}`,
        label,
        has,
        read: (c) => c.masks.find((m) => m.id === mask.id)?.[key],
        write: (c, v) => withMask(c, mask.id, (m) => ({ ...m, [key]: v })),
        path: `masks.${mask.id}.${key}`,
        ...opts,
      }),
    });
    const rows: ItemRow[] = [
      {
        type: "field",
        field: choiceField({
          id: `mask:${mask.id}:mode`,
          label: "Mode",
          options: MODES,
          has,
          read: (c) => c.masks.find((m) => m.id === mask.id)?.mode,
          write: (c, v) =>
            withMask(c, mask.id, (m) => ({
              ...m,
              mode: v === "subtract" || v === "intersect" ? v : "add",
            })),
        }),
      },
      num("feather", "Feather", { min: 0, max: 500, step: 1, unit: "px" }),
      num("expansion", "Expansion", { min: -500, max: 500, step: 1, unit: "px" }),
      num("opacity", "Opacity", { min: 0, max: 1, step: 1, unit: "%", display: 100 }),
      {
        type: "field",
        field: flagField({
          id: `mask:${mask.id}:inverted`,
          label: "Inverted",
          has,
          read: (c) => c.masks.find((m) => m.id === mask.id)?.inverted === true,
          write: (c, v) => withMask(c, mask.id, (m) => ({ ...m, inverted: v })),
        }),
      },
    ];
    if (mask.kind === "raster") {
      rows.unshift({
        type: "button",
        label: "Bitmap mask (not applied yet)",
        description: "Bitmap masks arrive with the photo tools.",
        op: () => null,
      });
    }
    if (mask.kind === "path") {
      rows.push({
        type: "key",
        label: "Animate the mask shape (then edit its points at each keyframe)",
        field: colorKeyField(`mask:${mask.id}:path`, "Mask shape", `masks.${mask.id}.path`, has),
      });
    }
    rows.push({
      type: "button",
      label: `Remove mask ${String(index + 1)}`,
      description: "Delete this mask.",
      op: (c) => removeMaskOp(c, mask.id),
      danger: true,
    });
    return { id: mask.id, title: `Mask ${String(index + 1)}`, rows };
  });
}
