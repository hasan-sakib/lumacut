# The photo workspace (M6)

A photo is a composition with `durationUs = 0`, drawn at t = 0. Each **layer is one track holding
one clip** (all starting at 0), so everything in the video editor works on a photo too: transform,
opacity, blend modes, masks, mattes, effects, colour, text, shapes. There is no timeline: the page
shows the canvas, a tool rail, an options bar and panels (Layers, Properties, Filters, Canvas,
Images, History).

## Creating a photo
`POST /api/projects` takes optional `width`, `height` and `background` (a photo defaults to a
transparent background, one empty layer and no audio track). In the library: **New photo** (blank
canvas; action `project.newPhoto` with optional width/height) and **Edit photo** (a ready image is
selected: `project.newPhotoFromImage`, canvas = the image's size, the image is its first layer).

## Large images: the engine `view`
The engine can draw a *window* of a composition at a scale (`RenderOptions.view`,
`Engine.setView`, `PlaybackSession.setView`): the canvas takes the window's output size, and layer
matrices are pre-multiplied by `scale · translate(-x, -y)` (`render/view.ts`). The photo stage asks
for just the visible part of the canvas at screen resolution, so a 6000 px photo at fit-zoom is a
~1500 px render instead of 144 MB targets. Without a view everything behaves as before.

* **Sources:** an image layer drawn at ≤ 2048 px long side uses the worker's `preview` rendition (a
  proxy); larger (zoomed in, or exported) it uses the original. Images larger than the GPU's
  `maxTextureSize` are shrunk to fit on load (`loadImageBitmap(…, maxSide)`).
* **Export tiles:** the same window mechanism draws a full-size export in ≤ 2048 px tiles with a
  48 px margin that is discarded (`export/tiles.ts: planTiles`), so effects that look at
  neighbours have no seam.
* Text rasterises at 1× only (soft when zoomed far in); shapes pick a 1/2/4× bucket from the
  drawn scale.

## Painting
`paint` clips hold vector strokes (`PaintStroke`: tool, colour, size, hardness, opacity, x/y/pressure
triples in layer pixels). The engine rasterises them with Canvas 2D stamps (`paint/stamp.ts`,
`paint/raster.ts`): stamps are spaced a fraction of the diameter apart (no randomness), a stroke is
built on its own small layer and then laid on the picture at its opacity (or erased with
`destination-out`). The live canvas of a layer is kept, so a stroke added to the end of the list
draws only that stroke; undo or a new zoom bucket redraws all. The picture covers the canvas plus
wherever strokes reach (up to one canvas size beyond each edge) at a power-of-two resolution that
keeps it within 16 M pixels. The raster cache is never saved.

* The overlay captures pointer events (pressure, coalesced points), previews the stroke in SVG and
  runs `paint.stroke` on release: **one stroke = one undo step**. With no paint layer selected a
  stroke makes one; the eraser needs one.
* Actions: `layer.addPaint`, `paint.stroke`, `paint.clear`, `brush.set`, `brush.larger` (`]`),
  `brush.smaller` (`[`); tools `tool.brush` (Alt+B), `tool.eraser` (Alt+X).

## Bitmap masks and the mask brush
A `RasterMask` points at an image asset; its **alpha channel** is the mask. The engine loads the
picture (`#prepareMasks`, kept for the last 12 assets) and draws it, stretched over the layer, into
the same alpha picture as path masks (mode, opacity, invert, feather).

The mask brush (`tool.maskBrush`, Alt+K; reveal/hide in the options, Alt flips for one stroke)
paints a local alpha picture (`photo/mask-session.ts`, ≤ 4096 px long side), shows it live through
`Engine.setMaskOverride` (the engine draws the override instead of the saved asset), and a moment
after the last stroke saves it: PNG → the normal upload pipeline (it appears in the library as
"Layer mask") → one batch (`addAsset` + `addMask`, or `updateMask` for the layer's existing bitmap
mask) → override cleared. Old mask assets stay in the library.

## Selections
Editor state, not saved (`stores/editor.ts: selection`): one closed Bézier path in canvas pixels
(rectangle, ellipse or lasso), a feather and an invert flag; marching ants in the overlay. Actions
(`actions/marquee.ts`): `marquee.selectAll`, `marquee.set`, `marquee.clear` (Mod+Shift+D),
`marquee.invert` (Mod+Shift+I), `marquee.feather`, **`marquee.toMask`** (add / subtract / intersect:
the path is mapped into the layer's own pixels with the inverse of its animated transform; the
feather becomes layer pixels). Tools: Alt+R, Alt+O, L. (The `selection.*` actions are the *clip*
selection of the timeline; hence `marquee`.)

## Canvas operations
Each is a **`CanvasEdit`** (`photo/canvas-ops.ts`): the new size and a map from old to new canvas
pixels. Applying it sets the composition size and moves every picture layer by that map
(`transformUnder` rebuilds position, scale, rotation and skew; a mirror comes out as a negative X
scale). Colour fills and adjustment layers always cover the canvas and aren't moved. Nothing is
destroyed, so undo is exact. Actions: `canvas.crop`, `canvas.cropToSelection`,
`canvas.rotateLeft/Right`, `canvas.straighten` (turn, then crop to the largest rectangle with the
canvas's proportions that fits), `canvas.flip`, `canvas.resize` (anchor, optionally scaling the
picture). A layer with an animated transform blocks them with a message.

## Layers
`actions/photoLayers.ts`: `layer.moveUp/Down/ToTop/ToBottom` (Mod+] / [ and with Shift),
`layer.moveTo` (drag), `layer.duplicate` (Mod+J), `layer.delete`, `layer.rename`,
`layer.toggleHidden`, `layer.toggleLocked`, `layer.setOpacity`, `layer.setBlend`, `layer.group`
(Mod+G: the `precompose` op, and the emptied layers go), `layer.ungroup` (Mod+Shift+G: only groups
that were not moved, scaled, masked, faded or given effects), `layer.addLook` (a built-in LUT as an
adjustment layer). Panel buttons are registry actions and take an optional `trackId`.

## Export
`export.image` (and the **Export…** window, `export.open`, Mod+Shift+E): PNG, JPEG or WebP, quality,
size in percent, background colour for transparency (always for JPEG). `photo/export-image.ts`
creates an `EngineClient` of its own (so the preview isn't disturbed), draws the tiles with
`readback`, un-premultiplies them, stitches them on an `OffscreenCanvas`, flattens, encodes. For a
video the same action exports the frame at the playhead. Browser limit: 16384 px on a side.

## Zoom and pan
`photo/view.ts` holds the maths (`PhotoView`: zoom or fit, centre; `engineWindow`, `zoomAbout`,
`panBy`, `overlayViewBox`). Wheel pans, ctrl/⌘ + wheel (pinch) zooms about the cursor, Space or the
hand tool drags, the zoom tool clicks. Actions `view.zoomIn/Out` (Mod+= / Mod+-), `view.fit`
(Mod+0), `view.zoomTo` (Mod+1).

## Keyboard
Alt+letter shortcuts work on macOS (the shortcut matcher reads the physical key when Alt is held).
Shortcuts are unique across the whole editor registry (a duplicate throws when the module loads).

## Not built / limits
AI subject select (M11), magic wand, combining selections, brushes clipped by a selection, merge or
flatten layers, layer thumbnails, painting beyond one canvas size outside the canvas, mask brush
and selection masks on a paint layer whose strokes lie outside the canvas, text sharper than 1×
when zoomed in, tiled GPU textures per layer, noise effects tied to pixel position differ between
scales. See PROGRESS.md for the test plan.
