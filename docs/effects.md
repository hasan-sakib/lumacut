# Effects and transitions (`packages/effects`)

An effect is a definition, not UI code: its parameter list builds the inspector controls
(CLAUDE.md rule 8), its GLSL does the work, and the engine runs it. There are 40 effects and 14
transitions today.

## Where things are
```
packages/effects/src/
  define.ts            EffectDefinition, TransitionDefinition, PassContext
  params.ts            ParamDef (number, int, boolean, enum, colour, point) and Params
  p.ts                 short builders: num, int, percent, px, degrees, bool, choice, color, point, rgb
  effects/<id>/        index.ts (definition) + <id>.frag.glsl (one file per pass)
  effects/index.ts     the registry, EFFECTS
  transitions/<id>/    the same shape for transitions
  shared/              the Gaussian blur, bright-pass and glow-combine shaders several effects use
packages/engine/src/gl/shaders/
  fx-common.glsl       uSize, uFrame, noise(), toSrgb/toLinear, imageUv()…
  effect-common.glsl   uSrc, uOrig, uScale, uPad, tapSrc(), contentUv(), vnoise()…
  transition-common.glsl  uA, uB, uProgress, A(uv), B(uv), ease()
```

## Adding an effect
1. Make `effects/<id>/index.ts` with `defineEffect({ id, name, category, description, keywords, params, passes })`
   and the shader next to it. Import the shader with `?raw`.
2. Add it to `effects/index.ts`. That is all: the effects browser, the `effect.add` action (its enum
   is built from the registry), the palette, and the inspector controls follow.

`params` are `ParamDef`s. Stored values are numbers, booleans, strings (enum choices), `[x, y]`
points and sRGB colours (`ParamValue` in the schema); `Params` fills defaults and clamps to limits
before the shader sees a value. Number, point and colour parameters get the ◆ keyframe control
automatically (path `effects.<instanceId>.params.<id>`).

Each pass is `{ shader, uniforms?(params, ctx) }`. A pass reads the previous pass as `uSrc` and the
effect's input as `uOrig`, and writes `outColor`. Lengths in parameters are **layer pixels**:
multiply by `ctx.scale` (target pixels per layer pixel) when you hand them to the shader.
`expand(params)` says how many layer pixels the picture can grow by on every side; the engine adds
that transparent margin (blur, glow and shadow need it) and `contentUv()` keeps 0..1 on the layer
itself.

## Rules for shaders
* Colour is **linear and premultiplied**. Use `straight(c)` to get unpremultiplied colour and
  `toSrgb`/`toLinear` when an operation should look right on screen (posterize, invert, keys).
* Geometry that has a direction (blur angle, wave, gradient) uses `pixelPos()`/`contentUv()`, which
  have the origin at the **top-left**, y down. `vUv` is a texture coordinate and is bottom-up.
* Never use wall-clock time or unseeded randomness (CLAUDE.md rule 6). Time-dependent effects use
  `uFrame` (the composition frame index) and a `seed` parameter through `noise()`/`vnoise()`.
* Uniform names must not clash with `uSize`, `uFrame`, `uSrc`, `uOrig`, `uScale`, `uPad`
  (`uA`, `uB`, `uProgress` for transitions).

## How the engine runs them (SPEC §6 order)
source → crop → colour → effects (in stack order) → transform → blend. A clip with neutral colour
and no enabled effects skips this and is drawn directly. A layer is processed at no more
resolution than it is drawn at. An unknown effect id is reported (`unknown_effect`) and skipped.

* **Solid** clips (`solid.color`) are a 1×1 texture stretched over the composition; the generate
  effects (gradient, noise, grid) are meant to sit on them.
* **Adjustment** clips apply their colour and effects to everything below them, over their time
  range, mixed by their opacity and blend mode (their transform is ignored).

## Transitions
`transitionIn` sits on the incoming clip and blends from the clip before it on the same track,
which must end exactly where this one starts (`setTransition` checks; a clip that has been moved
away keeps its transition but draws as a plain cut and reports
`transition_without_neighbour`). `alignment` puts the window around the cut: `start` (begins at the
cut), `end` (finishes at it) or `center`. During the window both clips are drawn alone at
composition size with their own transform, colour, effects and opacity, a transition shader blends
them by `progress`, and the result is composited with the incoming clip's blend mode. Outside its
trimmed range a clip is read from its **source handles** when the media has them, and the first or
last frame is held at the media's ends. Audio is not crossfaded yet (M7). Morph-cut is deferred
(SPEC: "may be v1.5").

## Not tested yet
Per the owner's order (tests after every milestone is built) M4 has **no golden images** for the
effects and transitions, and the shaders have never been compiled by a GPU. The first
`make test-engine` with goldens is also the first compile of all 54 shaders.
