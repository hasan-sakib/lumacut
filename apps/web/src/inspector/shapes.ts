import type { Clip, Color, Composition, Op, ShapeData, ShapeItem } from "@lumacut/schema";
import type { FieldDef } from "./fields.ts";
import { choiceField, colorKeyField, flagField, numberField, pointFields } from "./synthetic.ts";

export type ShapeKind = "rect" | "ellipse" | "polygon" | "star";
export const SHAPE_KINDS: readonly { kind: ShapeKind; label: string; description: string }[] = [
  { kind: "rect", label: "Rectangle", description: "A rectangle with optional rounded corners." },
  { kind: "ellipse", label: "Ellipse", description: "An ellipse or circle." },
  { kind: "polygon", label: "Polygon", description: "A regular polygon (triangle, pentagon…)." },
  { kind: "star", label: "Star", description: "A star with any number of points." },
];

export const DEFAULT_FILL: Color = { r: 1, g: 0.23, b: 0.42, a: 1 };

/** A new item `size` px across, centred on the shape's origin. */
export function defaultShapeItem(kind: ShapeKind, id: string, size: number): ShapeItem {
  switch (kind) {
    case "rect":
      return { kind, id, position: [0, 0], size: [size * 1.6, size], roundness: 0 };
    case "ellipse":
      return { kind, id, position: [0, 0], size: [size, size] };
    case "polygon":
      return { kind, id, position: [0, 0], points: 5, radius: size / 2, roundness: 0, rotation: 0 };
    case "star":
      return {
        kind,
        id,
        position: [0, 0],
        points: 5,
        innerRadius: size * 0.2,
        outerRadius: size / 2,
        innerRoundness: 0,
        outerRoundness: 0,
        rotation: 0,
      };
  }
}

/** An item filling a `w` × `h` box centred on the shape's origin (what dragging out a shape draws). */
export function shapeItemForBox(kind: ShapeKind, id: string, w: number, h: number): ShapeItem {
  const size = Math.max(1, Math.min(w, h));
  switch (kind) {
    case "rect":
      return { kind, id, position: [0, 0], size: [Math.max(1, w), Math.max(1, h)], roundness: 0 };
    case "ellipse":
      return { kind, id, position: [0, 0], size: [Math.max(1, w), Math.max(1, h)] };
    case "polygon":
      return { kind, id, position: [0, 0], points: 5, radius: size / 2, roundness: 0, rotation: 0 };
    case "star":
      return {
        kind,
        id,
        position: [0, 0],
        points: 5,
        innerRadius: size * 0.2,
        outerRadius: size / 2,
        innerRoundness: 0,
        outerRoundness: 0,
        rotation: 0,
      };
  }
}

export function defaultShapeData(
  kind: ShapeKind,
  itemId: string,
  comp: Pick<Composition, "height">,
): ShapeData {
  return {
    items: [defaultShapeItem(kind, itemId, Math.round(comp.height * 0.25))],
    fill: { color: DEFAULT_FILL, rule: "nonzero" },
  };
}

const withShape = (clip: Clip, shape: ShapeData): { shape: ShapeData } => ({
  shape: { ...(clip.shape ?? { items: [] }), ...shape },
});

export function addItemOp(clip: Clip, kind: ShapeKind, id: string, size = 200): Op | null {
  if (clip.shape === undefined) return null;
  const item = defaultShapeItem(kind, id, size);
  return {
    type: "setProps",
    clipId: clip.id,
    props: { shape: { ...clip.shape, items: [...clip.shape.items, item] } },
  };
}

export function removeItemOp(clip: Clip, itemId: string): Op | null {
  if (clip.shape === undefined) return null;
  return {
    type: "setProps",
    clipId: clip.id,
    props: { shape: { ...clip.shape, items: clip.shape.items.filter((i) => i.id !== itemId) } },
  };
}

/** An item with `change` applied (used by fields that edit one item). */
function mapItem(
  clip: Clip,
  id: string,
  change: (i: ShapeItem) => ShapeItem,
): { shape: ShapeData } {
  const shape = clip.shape ?? { items: [] };
  return { shape: { ...shape, items: shape.items.map((i) => (i.id === id ? change(i) : i)) } };
}

export type ShapeRow =
  | { type: "field"; field: FieldDef }
  | {
      type: "color";
      field: FieldDef;
      label: string;
      read: (clip: Clip) => Color | undefined;
      write: (clip: Clip, color: Color) => { shape: ShapeData };
    }
  | { type: "key"; field: FieldDef; label: string }
  | { type: "remove"; itemId: string; label: string };

export interface ShapeGroup {
  id: string;
  title: string;
  rows: ShapeRow[];
}

const has = (clip: Clip): boolean => clip.shape !== undefined;
const f = (field: FieldDef): ShapeRow => ({ type: "field", field });

const ITEM_NAMES: Record<ShapeItem["kind"], string> = {
  rect: "Rectangle",
  ellipse: "Ellipse",
  polygon: "Polygon",
  star: "Star",
  path: "Path",
};

/** Number field for a numeric property of one shape item, keyframeable. */
function itemNumber(
  item: ShapeItem,
  prop: string,
  label: string,
  opts: { min?: number; max?: number; step?: number; unit?: string } = {},
): FieldDef {
  return numberField({
    id: `shape:${item.id}:${prop}`,
    label,
    has: (c) => c.shape?.items.some((i) => i.id === item.id) === true,
    read: (c) => {
      const found = c.shape?.items.find((i) => i.id === item.id);
      const v =
        found === undefined ? undefined : (found as unknown as Record<string, unknown>)[prop];
      return typeof v === "number" ? v : undefined;
    },
    write: (c, value) => mapItem(c, item.id, (i) => ({ ...i, [prop]: value })),
    path: `shape.items.${item.id}.${prop}`,
    ...opts,
  });
}

function itemPoint(item: ShapeItem, prop: "position" | "size", label: string, step = 1) {
  return pointFields({
    id: `shape:${item.id}:${prop}`,
    label,
    has: (c) => c.shape?.items.some((i) => i.id === item.id) === true,
    read: (c) => {
      const found = c.shape?.items.find((i) => i.id === item.id);
      const v =
        found === undefined ? undefined : (found as unknown as Record<string, unknown>)[prop];
      return Array.isArray(v) ? [Number(v[0]), Number(v[1])] : undefined;
    },
    write: (c, value) => mapItem(c, item.id, (i) => ({ ...i, [prop]: value })),
    path: `shape.items.${item.id}.${prop}`,
    unit: "px",
    step,
  });
}

function itemRows(item: ShapeItem, index: number): ShapeRow[] {
  const rows: ShapeRow[] = [];
  const name = `${ITEM_NAMES[item.kind]} ${String(index + 1)}`;
  switch (item.kind) {
    case "rect":
      rows.push(
        ...itemPoint(item, "position", "Position").map(f),
        ...itemPoint(item, "size", "Size").map(f),
      );
      rows.push(
        f(itemNumber(item, "roundness", "Corner radius", { min: 0, max: 2000, unit: "px" })),
      );
      break;
    case "ellipse":
      rows.push(
        ...itemPoint(item, "position", "Position").map(f),
        ...itemPoint(item, "size", "Size").map(f),
      );
      break;
    case "polygon":
      rows.push(...itemPoint(item, "position", "Position").map(f));
      rows.push(f(itemNumber(item, "points", "Points", { min: 3, max: 60, step: 1 })));
      rows.push(f(itemNumber(item, "radius", "Radius", { min: 0, max: 5000, unit: "px" })));
      rows.push(
        f(itemNumber(item, "roundness", "Corner radius", { min: 0, max: 2000, unit: "px" })),
      );
      rows.push(f(itemNumber(item, "rotation", "Rotation", { unit: "°" })));
      break;
    case "star":
      rows.push(...itemPoint(item, "position", "Position").map(f));
      rows.push(f(itemNumber(item, "points", "Points", { min: 3, max: 60, step: 1 })));
      rows.push(
        f(itemNumber(item, "outerRadius", "Outer radius", { min: 0, max: 5000, unit: "px" })),
      );
      rows.push(
        f(itemNumber(item, "innerRadius", "Inner radius", { min: 0, max: 5000, unit: "px" })),
      );
      rows.push(
        f(itemNumber(item, "outerRoundness", "Outer rounding", { min: 0, max: 2000, unit: "px" })),
      );
      rows.push(
        f(itemNumber(item, "innerRoundness", "Inner rounding", { min: 0, max: 2000, unit: "px" })),
      );
      rows.push(f(itemNumber(item, "rotation", "Rotation", { unit: "°" })));
      break;
    case "path":
      // Drawn with the pen: its points are edited on the canvas; here it can be animated.
      rows.push({
        type: "key",
        label: "Animate the path (then edit its points at each keyframe)",
        field: colorKeyField(
          `shape:${item.id}:path`,
          "Path",
          `shape.items.${item.id}.path`,
          (c) => c.shape?.items.some((i) => i.id === item.id) === true,
        ),
      });
      break;
  }
  rows.push({ type: "remove", itemId: item.id, label: name });
  return rows;
}

/** The inspector groups for a shape clip: items, fill, stroke, trim paths, round corners. */
export function shapeGroups(clip: Clip): ShapeGroup[] {
  const shape = clip.shape;
  if (shape === undefined) return [];
  const groups: ShapeGroup[] = [];
  shape.items.forEach((item, i) => {
    groups.push({
      id: `item:${item.id}`,
      title: `${ITEM_NAMES[item.kind]} ${String(i + 1)}`,
      rows: itemRows(item, i),
    });
  });

  const fillRows: ShapeRow[] = [
    f(
      flagField({
        id: "shape:fill:on",
        label: "Fill",
        has,
        read: (c) => c.shape?.fill !== undefined,
        write: (c, on) => {
          const { fill: _removed, ...rest } = c.shape ?? { items: [] };
          return { shape: on ? { ...rest, fill: { color: DEFAULT_FILL, rule: "nonzero" } } : rest };
        },
      }),
    ),
  ];
  if (shape.fill !== undefined) {
    fillRows.push({
      type: "color",
      field: colorKeyField(
        "shape:fill:color",
        "Fill colour",
        "shape.fill.color",
        (c) => c.shape?.fill !== undefined,
      ),
      label: "Colour",
      read: (c) => c.shape?.fill?.color,
      write: (c, color) => ({
        shape: {
          ...(c.shape ?? { items: [] }),
          ...(c.shape?.fill === undefined ? {} : { fill: { ...c.shape.fill, color } }),
        },
      }),
    });
    fillRows.push(
      f(
        choiceField({
          id: "shape:fill:rule",
          label: "Overlap",
          options: [
            { value: "nonzero", label: "Solid (non-zero)" },
            { value: "evenodd", label: "Holes (even-odd)" },
          ],
          has,
          read: (c) => c.shape?.fill?.rule,
          write: (c, value) => ({
            shape: {
              ...(c.shape ?? { items: [] }),
              ...(c.shape?.fill === undefined
                ? {}
                : {
                    fill: {
                      ...c.shape.fill,
                      rule: value === "evenodd" ? ("evenodd" as const) : ("nonzero" as const),
                    },
                  }),
            },
          }),
        }),
      ),
    );
  }
  groups.push({ id: "fill", title: "Fill", rows: fillRows });

  const strokeRows: ShapeRow[] = [
    f(
      flagField({
        id: "shape:stroke:on",
        label: "Stroke",
        has,
        read: (c) => c.shape?.stroke !== undefined,
        write: (c, on) => {
          const { stroke: _removed, ...rest } = c.shape ?? { items: [] };
          return {
            shape: on
              ? {
                  ...rest,
                  stroke: {
                    color: { r: 1, g: 1, b: 1, a: 1 },
                    width: 6,
                    cap: "round",
                    join: "round",
                    dash: [],
                  },
                }
              : rest,
          };
        },
      }),
    ),
  ];
  if (shape.stroke !== undefined) {
    const stroke = (c: Clip) => c.shape?.stroke;
    const setStroke = (c: Clip, change: Partial<NonNullable<ShapeData["stroke"]>>) => ({
      shape: {
        ...(c.shape ?? { items: [] }),
        ...(() => {
          const current = stroke(c);
          return current === undefined ? {} : { stroke: { ...current, ...change } };
        })(),
      },
    });
    strokeRows.push({
      type: "color",
      field: colorKeyField(
        "shape:stroke:color",
        "Stroke colour",
        "shape.stroke.color",
        (c) => stroke(c) !== undefined,
      ),
      label: "Colour",
      read: (c) => stroke(c)?.color,
      write: (c, color) => setStroke(c, { color }),
    });
    strokeRows.push(
      f(
        numberField({
          id: "shape:stroke:width",
          label: "Width",
          has: (c) => stroke(c) !== undefined,
          read: (c) => stroke(c)?.width,
          write: (c, v) => setStroke(c, { width: Math.max(0, v) }),
          path: "shape.stroke.width",
          min: 0,
          max: 500,
          step: 0.5,
          unit: "px",
        }),
      ),
      f(
        choiceField({
          id: "shape:stroke:cap",
          label: "Line ends",
          options: [
            { value: "butt", label: "Flat" },
            { value: "round", label: "Round" },
            { value: "square", label: "Square" },
          ],
          has,
          read: (c) => stroke(c)?.cap,
          write: (c, v) => setStroke(c, { cap: v === "butt" || v === "square" ? v : "round" }),
        }),
      ),
      f(
        choiceField({
          id: "shape:stroke:join",
          label: "Corners",
          options: [
            { value: "miter", label: "Sharp" },
            { value: "round", label: "Round" },
            { value: "bevel", label: "Bevel" },
          ],
          has,
          read: (c) => stroke(c)?.join,
          write: (c, v) => setStroke(c, { join: v === "miter" || v === "bevel" ? v : "round" }),
        }),
      ),
      f(
        numberField({
          id: "shape:stroke:dash",
          label: "Dash",
          has: (c) => stroke(c) !== undefined,
          read: (c) => stroke(c)?.dash[0] ?? 0,
          write: (c, v) => {
            const gap = stroke(c)?.dash[1] ?? stroke(c)?.dash[0] ?? v;
            return setStroke(c, { dash: v <= 0 ? [] : [v, gap] });
          },
          min: 0,
          max: 2000,
          step: 1,
          unit: "px",
        }),
      ),
      f(
        numberField({
          id: "shape:stroke:gap",
          label: "Gap",
          has: (c) => (stroke(c)?.dash.length ?? 0) > 0,
          read: (c) => stroke(c)?.dash[1] ?? stroke(c)?.dash[0],
          write: (c, v) => setStroke(c, { dash: [stroke(c)?.dash[0] ?? v, Math.max(0, v)] }),
          min: 0,
          max: 2000,
          step: 1,
          unit: "px",
        }),
      ),
    );
  }
  groups.push({ id: "stroke", title: "Stroke", rows: strokeRows });

  const trimRows: ShapeRow[] = [
    f(
      flagField({
        id: "shape:trim:on",
        label: "Trim paths",
        has,
        read: (c) => c.shape?.trimPaths !== undefined,
        write: (c, on) => {
          const { trimPaths: _removed, ...rest } = c.shape ?? { items: [] };
          return { shape: on ? { ...rest, trimPaths: { start: 0, end: 1, offset: 0 } } : rest };
        },
      }),
    ),
  ];
  if (shape.trimPaths !== undefined) {
    const trim = (c: Clip) => c.shape?.trimPaths;
    const setTrim = (c: Clip, change: Partial<NonNullable<ShapeData["trimPaths"]>>) => ({
      shape: {
        ...(c.shape ?? { items: [] }),
        ...(() => {
          const current = trim(c);
          return current === undefined ? {} : { trimPaths: { ...current, ...change } };
        })(),
      },
    });
    for (const [key, label, percentDisplay] of [
      ["start", "Start", true],
      ["end", "End", true],
      ["offset", "Offset", false],
    ] as const) {
      trimRows.push(
        f(
          numberField({
            id: `shape:trim:${key}`,
            label,
            has: (c) => trim(c) !== undefined,
            read: (c) => trim(c)?.[key],
            write: (c, v) =>
              setTrim(c, { [key]: key === "offset" ? v : Math.min(1, Math.max(0, v)) }),
            path: `shape.trim.${key}`,
            ...(percentDisplay
              ? { min: 0, max: 1, step: 1, unit: "%", display: 100 }
              : { step: 1, unit: "°" }),
          }),
        ),
      );
    }
  }
  groups.push({ id: "trim", title: "Trim paths", rows: trimRows });

  const roundRows: ShapeRow[] = [
    f(
      flagField({
        id: "shape:round:on",
        label: "Round corners",
        has,
        read: (c) => c.shape?.roundCorners !== undefined,
        write: (c, on) => {
          const { roundCorners: _removed, ...rest } = c.shape ?? { items: [] };
          return { shape: on ? { ...rest, roundCorners: 20 } : rest };
        },
      }),
    ),
  ];
  if (shape.roundCorners !== undefined) {
    roundRows.push(
      f(
        numberField({
          id: "shape:round:radius",
          label: "Radius",
          has: (c) => c.shape?.roundCorners !== undefined,
          read: (c) => c.shape?.roundCorners,
          write: (c, v) => ({
            shape: { ...(c.shape ?? { items: [] }), roundCorners: Math.max(0, v) },
          }),
          path: "shape.roundCorners",
          min: 0,
          max: 2000,
          unit: "px",
        }),
      ),
    );
  }
  groups.push({ id: "round", title: "Rounding", rows: roundRows });
  return groups;
}

export { withShape };
