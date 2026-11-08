# Shapes (`packages/engine/src/shapes`)

A shape clip (`type: "shape"`, `clip.shape`) is a list of **items** plus a fill, an optional stroke,
optional trim paths and a corner rounding. It is a composition layer like any other: transform,
opacity, blend mode, masks, effects, mattes and motion blur all apply.

## Items
`rect`, `ellipse`, `polygon`, `star` and `path` (Bézier vertices with in/out tangents; open or
closed). Every item has an `id`, a `position` and, per kind, `size`, `roundness`, `points`,
`radius` / `innerRadius` / `outerRadius`, `rotation` or a `path`.

`outline.ts` turns an item into Bézier subpaths (`itemOutline`), with `outlineLength` and
`outlineBounds` for trim paths and layout. Rounded corners (`roundCorners`, rect `roundness`,
polygon/star rounding) replace each corner with an arc.

## Drawing
Shapes are **rasterised with Canvas 2D (`Path2D`) in the worker**, like text (a deviation from
SPEC's "tessellation or SDF", recorded in PROGRESS.md: Canvas gives exact joins, caps, dashes and
even-odd fills). `renderShape(shape, resolution)` returns the picture; the engine caches it by
content and a resolution bucket (1×, 2× or 4×, so zooming does not re-raster every frame), uploads
it like an image, and `shapeMetrics` gives the layer size and padding (stroke width, dash and
trim included). Shape and text clips measure `anchorX/Y` from the **centre** of the picture
(`anchorShift`).

Trim paths use the flattened path length (`trimDash`): `start`, `end`, `offset` (0..1).

## Keyframes
`shape.fill.color`, `shape.stroke.color`, `shape.stroke.width`, `shape.trim.start|end|offset`,
`shape.roundCorners`, and `shape.items.<itemId>.<prop>` for every numeric/point item property and
`path` (Bézier paths interpolate vertex by vertex). Each has the ◆ in the Inspector. Removing an item
removes its keyframes.

## Actions
`shape.add` (rectangle, ellipse, polygon, star; optional position/size), `shape.addPath` (pen
output), `shape.addItem`, `shape.removeItem`, `shape.setStyle`; tools `tool.rectangle` (R),
`tool.ellipse` (E), `tool.polygon` (Shift+P), `tool.star` (Shift+E), `tool.pen` (P); the pen drops
vertices on click, drags out tangents, and closes on the first point. When a clip is selected and
mask mode (`tool.penMode`, Alt+P) is on it makes a mask instead of a shape.

## The on-canvas overlay (`apps/web/src/overlay`, `components/preview`)
An SVG layer over the preview in composition pixels (`viewport.ts` maps pixels to screen under the
letterboxed canvas). Pure geometry (`layer-box`, `gizmo`, `path-edit`, `pen`, `motion-path`,
`editable-paths`, `transform-ops`) is separate from `PreviewOverlay.tsx`, which only turns pointer
events into ops (with coalescing). It carries the transform gizmo (move, scale, rotate), the shape
tools and pen, path editing for shape paths and masks (vertices, tangents, add/delete vertex), and
the motion path of the selected clip's position keyframes with draggable spatial tangents.

## Not tested yet
No goldens for fill/stroke/dash/trim/round corners, no overlay interaction tests; see PROGRESS.md.
