# Motion presets (`packages/ops/src/presets`)

A preset is a **pure function** `(clip, context) → Op[]` (`MotionPreset.ops`). It adds ordinary
keyframes (and, for text reveals, a text animator with a keyframed `range.offset`), so everything
stays editable in the Inspector and the graph editor: nothing is locked and applying a preset twice
gives the same result as once (`setFrames` replaces the property's keyframes inside the preset's
time window and keeps the rest).

Context: composition size (slides move by a fraction of it), `startUs` and `durationUs` (clip
relative), `intensity` (1 = normal), `newId`. `presetOps(preset, clip, options)` picks the window:
In presets at the clip's start, Out at its end, Emphasis at the playhead, Text at the start (or
`startUs`).

| Category | Presets |
| --- | --- |
| In | fadeIn, slideIn Left/Right/Up/Down, pop, bounceIn |
| Out | fadeOut, slideOut Left/Right |
| Emphasis | zoomPunch, shake, glitch |
| Text | textTypewriter, textFadeUp, textWordsIn, textOut |

**Shake and glitch** use a seeded PRNG (`seeded(hashString(clip.id) ^ startUs)`, mulberry32): the
same clip and start always give the same motion (CLAUDE.md rule 6). Bounce uses the graph editor's
baked bounce ease (`applyEasePreset`).

Actions: `preset.apply` (`preset`, optional `durationUs`, `intensity`, `startUs`) and the Presets tab
in the side panel. Adding a preset = one entry in `MOTION_PRESETS`; the action's enum, the palette
and the tab follow.

## Not tested yet
No tests for any preset's keyframe shape; see PROGRESS.md.
