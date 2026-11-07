# Colour pipeline (`packages/engine/src/color`, `gl/shaders/color.frag.glsl`)

The grade is one shader pass. `color/reference.ts` is the same maths in TypeScript and is the
specification: `browser-test/color-shader.test.ts` renders a 1024-colour picture through every
setting and compares it with the reference (± 2/255, which is 16-bit float storage and GPU maths).
Change the shader and the reference together.

## Space and order
Everything works in **linear Rec. 709 / sRGB-primaries** light on **straight (unpremultiplied)**
colour; alpha passes through and the result is premultiplied again. Sources are linearised when they
are sampled (the layer's first pass), so "linearize" in SPEC §6 is already done.

| # | Step | Settings | Maths (c = linear rgb) |
|---|---|---|---|
| 1 | White balance | `temperature`, `tint` (±100) | c × (2^(t·0.005), 2^(−m·0.005), 2^(−t·0.005)): warm raises red and lowers blue; magenta tint lowers green |
| 2 | Exposure | `exposure` (stops) | c × 2^stops |
| 3 | Tone | `contrast`, `highlights`, `shadows`, `whites`, `blacks` (±1) | contrast: 0.18·(c/0.18)^(1+contrast). Then with L = luma(c)^(1/2.2): c × 2^(shadows·(1−smoothstep(0,.5,L)) + highlights·smoothstep(.5,1,L) + whites·smoothstep(.75,1,L)) + blacks·0.04·(1−smoothstep(0,.25,L)) |
| 4 | Wheels | `gain`, `offset`, `lift`, `gamma` (rgb, ±1) | c·(1+gain); + offset·0.1; + lift·0.1·(1−clamp(c)); then c^(1/(1+gamma)) |
| 5 | Curves, HSL ranges | `curves`, `hsl` | on **sRGB-encoded** values: per-channel curve then master curve; then in HSL: hue-vs-sat, hue-vs-hue, luma-vs-sat curves (0.5 = no change) and the 8 colour ranges (hue ±30°, saturation and luminance ±1; weights fall off linearly over 45° and fade out for greys) |
| 6 | Saturation, vibrance | `saturation`, `vibrance` | y + (c − y)·(1 + saturation + vibrance·(1 − chroma)), y = luma(c), chroma from encoded values |
| 7 | LUT | `lut` | encoded values through a 3D table (trilinear), mixed with the input by `intensity` |
| 8 | Output | | linear, premultiplied; the compositor converts to sRGB when presenting |

Steps that are exactly neutral are skipped in the shader (a GPU `pow()` is only accurate to a few
parts in a thousand, which would show on a barely-touched grade). A clip whose grade is neutral
(`isNeutralColor`) skips the pass altogether and is drawn directly.

## Curves
`CurvePoints` are sorted, then interpolated with a **monotone cubic** (Fritsch–Carlson), so a curve
can't overshoot or invert tones between points. Each is sampled to 256 entries; the seven curves
(master, r, g, b, hueVsSat, hueVsHue, lumVsSat) are one 256×7 `R16F` texture. Tone curves default to
the identity line, the three hue/luma curves to the flat 0.5 line.

## LUTs
`LutRef.lutId` is either `builtin:<name>` (eight looks generated from formulas in
`color/builtin-luts.ts`: no files, no licence) or the id of an asset of kind `lut` (a `.cube` file
uploaded to the library; the worker validates it and keeps the file as the `lut` rendition, the
engine downloads and parses it with `parseCube`). 1D tables are expanded to a 33³ cube. Tables are
expected to take display-referred (sRGB-encoded) input in `DOMAIN_MIN`..`DOMAIN_MAX`; log-input
LUTs aren't supported. A LUT that can't be loaded gives a `lut_unavailable` diagnostic and the clip
is shown without it.

## Layers with a grade are resampled in linear light
A clip with colour (or effects) is first drawn into a layer-local target in linear light and then
transformed from it, so scaling and rotation filter in linear light. A plain clip is filtered in
encoded values (M2 behaviour). The two agree on smooth pictures and differ slightly on hard,
high-contrast edges; they are identical for unscaled, unrotated layers. A layer is processed at no
more resolution than it is drawn at (a 4K clip on a 1080p canvas costs 1080p passes).

## Not done yet
HDR / wide-gamut input and output transforms, log-input LUTs, a tetrahedral LUT interpolation
(trilinear is used), ACES-style tone mapping, secondary qualifiers beyond the 8 HSL ranges.
