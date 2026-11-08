# Masks, track mattes, motion blur, text animators

## Masks (`clip.masks`)
A mask is `{ id, kind: "path", path, mode, inverted, feather, expansion, opacity }`. Path vertices
are in the clip's **own picture** pixels, so a mask follows the clip's transform. Modes combine in
order: `add` (show inside), `subtract` (cut a hole), `intersect`. `expansion` grows or shrinks the
path (a stroke of that width), `feather` softens the edge (Canvas `blur()`), `inverted` flips it.

`renderMasks(masks, place)` (engine `shapes/mask-raster.ts`) draws all path masks to one alpha
picture; the engine caches it (`m:…`) and `LayerFx` multiplies the layer by it in a `mask` pass
(`mask.frag.glsl`) after crop and before colour (SPEC §6 order). Raster masks (mask brush, AI
select) belong to M6/M11 and are diagnosed `ignored_raster_mask`.

Keyframes: `masks.<id>.path|feather|expansion|opacity`. Actions: `mask.add` (rect/ellipse),
`mask.addPath` (pen), `mask.remove`, `mask.setMode`. `removeMask` also removes the mask's keyframes.

## Track mattes (`clip.trackMatte {sourceClipId, mode}`)
Modes `alpha`, `alphaInverted`, `luma`, `lumaInverted`. The matte clip must be in the same
composition. `planLayers` marks the matte clip as **hidden** (it is not drawn by itself, as in AE's
"hide matte layer") and attaches the plan to the matted clip; the engine draws both alone at
composition size and `matte.frag.glsl` multiplies. A missing source is diagnosed. Actions:
`matte.set` (the clip above by default, `below`, or a clip id), `matte.clear`.

## Motion blur (`clip.motionBlur {enabled, shutterAngle, samples}`)
Only for clips with `enabled`. The clip is drawn `samples` times (default 16, ≤ 64) at evenly spaced
sub-frame times across `shutterAngle/360 × frame duration`, centred on the frame, and averaged by
additive blending (`accumulate.frag.glsl`). Only **animated** properties differ between the samples
(transform, opacity, shape/mask/animator and effect parameters); a clip with no keyframes is drawn
once. Video frames are the frame's own. Sub-frame times come from the frame number, never from the
clock, so renders stay deterministic. Keyframe: `motionBlur.shutterAngle`. Action: `motion.blur`.

## Text animators (`clip.text.animators`)
AE-style range selectors. Each animator has a `unit` (`char`, `word`, `line`), a `range`
`{start, end, offset, shape}` and `props` (opacity, position, scale, rotation, blur, tracking,
fillColor). Per unit, `coverage` (0..1) comes from the range and `shape` (`square`, `rampUp`,
`rampDown`, `triangle`, `round`, `smooth`); the unit then gets `props` scaled by that coverage.
Animated text is drawn unit by unit on the canvas; the cache key includes the evaluated animator
values, so keyframing `range.offset` animates it. Keyframes: `text.animators.<id>.range.*` and
`text.animators.<id>.props.*`. Actions: `text.addAnimator`, `text.removeAnimator`.

## Precompose and compositions
`clip.precompose` wraps the selected clips in a nested composition (the `precompose` op).
`composition.open` / `composition.close` (Alt+ArrowUp) move into and out of it; the page shows a
breadcrumb, and double-clicking a composition clip opens it. The nested composition edits like any
other.
