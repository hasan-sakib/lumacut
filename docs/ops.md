# Ops: semantics (`packages/ops`)

`applyOp(project, op) → { project, inverse }` is pure. It never mutates its input, never reads a clock or random source, and either returns a valid project or throws `OpError` (stable `code`, actionable message) with the input untouched. Times are integer microseconds.

## Rules that hold for every op
- **Inverses are exact.** `applyOp(applyOp(p, op).project, inverse).project` deep-equals `p`. Structural ops (compositions, tracks, assets, markers) invert with their natural counterpart. Every clip-level op computes its inverse by *diffing the clips before and after*: `removeClip` for new clips, `addClip` for deleted ones, `moveClip` for ones that changed track, and one `setProps` (with `unset` for fields that were absent) for the rest. The inverse is always a `batch`.
- **Canonical order.** A track's clips are sorted by `startUs`. Every op re-sorts the tracks it touched, so inverses restore the exact array order.
- **Invariants are checked once, after the whole top-level op** (so a `batch`, or an inverse that briefly overlaps clips, is judged on its end state): ids unique, references exist, track kind fits the clip, `inUs < outUs`, `speed > 0`, timeline length ≥ 1 µs, source range inside the asset's duration, no overlap on a track, no composition cycles, locked tracks untouched.
- **Locked tracks:** an op that adds, removes, moves or edits a clip on a locked track fails with `track_locked`. Inverses never trip this because undo runs in LIFO order against the state the op produced.
- **`batch`** applies its ops in order and is atomic. Its inverse is a batch of the inverses in reverse order: one undo step.
- `meta.updatedAt` is not touched by ops (the store/server stamps it).

## Time mapping
Timeline length of a clip is `clipTimelineDurationUs` (`round((outUs − inUs) / speed)`); its end is `startUs + length`. A timeline offset `d` from the clip start is `round(d × speed)` of source time. For a reversed clip the timeline start corresponds to `outUs`.
With `speed = 1` trims land on the exact microsecond requested; for other speeds the resulting length is within 1 µs of the request (the source bounds are exact).

## Clip ops
| Op | Meaning |
|---|---|
| `addClip` | Insert on a track (sorted). Media clips on audio tracks must reference a video/audio asset; picture clips go on visual tracks. |
| `removeClip` | Delete the clip. Link groups of one remaining member are legal and behave as unlinked. |
| `moveClip` | Change track and start. Moves only this clip: the action layer batches moves of linked clips. |
| `trimClip(edge, toUs)` | Move one edge to a timeline time. Start edge: `startUs = toUs`, `inUs` (or `outUs` if reversed) shifts accordingly. End edge: changes the source out (or in) point. Nothing else moves; collisions fail with `clips_overlap`. Extending past the asset's start/end fails. |
| `rippleTrim(edge, toUs)` | Like `trimClip`, then clips later on the **same track** shift by the change in length. For the start edge the clip **keeps its `startUs`**: `toUs − startUs` is how much is cut from (or added to) the head. |
| `rollEdit(left, right, toUs)` | The two clips must be adjacent on one track (`left.end == right.start`). The cut moves to `toUs`; both source ranges adjust. |
| `slipClip(delta)` | Shift `inUs` and `outUs` together by `delta` **source** µs; timeline position and length are unchanged. |
| `slideClip(delta)` | Move the clip by `delta`; a neighbour that was adjacent has its facing edge trimmed by the same amount so no gap or overlap appears. A side that wasn't adjacent is left alone. |
| `splitClip(at, newId)` | `startUs < at < end`. The first half keeps the id; the second gets `newId`, starts at `at`, loses `transitionIn` and `linkId` (the action layer links the new halves). Audio `fadeOutUs` moves to the second half, `fadeInUs` stays on the first. Masks/effects are copied to both. |
| `rippleDelete` | `kind: "clips"`: remove them and shift later clips on the same track(s) left by the removed length. `kind: "range"`: remove `[start, end)` on the listed tracks (clips are cut, a spanning clip is split with the tail id `<id>-r<end>`), then close the gap. |
| `setProps` | Shallow patch of clip fields, then `unset` fields removed. |
| `linkClips` / `unlinkClips` | Set or clear `linkId`. A `linkId` already used by a clip outside the list fails. |
| `setPlaceholder` | Set or clear `placeholder`. |
| `precompose` | Move the clips into a new composition (size/fps/background of the source; times shifted so the earliest clip starts at 0; one track per source track) and put a `composition` clip in their place on the lowest visual track involved. Fails with `clips_overlap` if that span isn't free there. |

### Keyframes, masks, effects, transitions, paint
Keyframes are kept sorted by `tUs`, one per `tUs` per path. **`addKeyframe`/`updateKeyframe` validate the path and value** (`invalid_property`): the path must be an animatable property of that clip and the value must be of its kind (number, point, colour, shape):
`transform.{x,y,scaleX,scaleY,rotation,anchorX,anchorY,skew}`, the points `transform.{position,scale,anchor}`, `opacity`, `crop.{left,top,right,bottom}`, `color.<scalar>`, `color.{lift,gamma,gain,offset}.{r,g,b}`, `audio.{volume,pan}` (clip must have an audio block) `effects.<effectId>.params.<name>` (number, point or colour parameters), `masks.<id>.{path,feather,expansion,opacity}`, `shape.fill.color`, `shape.stroke.{color,width}`, `shape.trim.{start,end,offset}`, `shape.roundCorners`, `shape.items.<id>.<property>` (position, size, radius, rotation, path…), `text.animators.<id>.range.{start,end,offset}`, `text.animators.<id>.props.<name>` and `motionBlur.shutterAngle`. `removeMask` also removes the mask's keyframes. Two animated properties may not drive the same field (`transform.x` with `transform.position`). `removeEffect` also removes that effect's keyframes. Masks and effects are addressed by their ids (unique within the clip); `setTransition` sets or clears `transitionIn`: the clip before it on the track must end exactly where it starts (`not_adjacent`), and the window around the cut must fit (`start`: within this clip; `end`: within the previous clip; `center`: half in each) or it fails with `invalid_range`; paint ops require a `paint` clip.

**Keyframe time base:** `Keyframe.tUs` is **relative to the clip's `startUs`** (clip-local), as the schema states. Moving a clip moves its animation with it; trimming the head does not retime keyframes. Before the first keyframe a property holds the first value, after the last it holds the last; the clip's static value is ignored while a property has keyframes.

**Evaluation (`evaluate`, `animatedClip`):**
- A segment's behaviour is set by its first keyframe: `hold` keeps the value until the next keyframe; `linear` is a straight line; `bezier` uses the first keyframe's `easeOut` and the second's `easeIn` (After Effects model: influence is a percentage of the segment's duration, speed is in property units per second; a missing ease means a third of the segment at the average speed, which is exactly linear).
- Points, colours and shapes ease along a *distance* coordinate: the length of the straight line or of the spatial bezier (`spatialTangents`, relative to the keyframe position, arc-length parameterised), the distance in linear light for colours (colours blend in linear light), and 1 for shapes (vertex-wise; shapes with a different vertex count or open/closed flag switch at the end of the segment). Speed is in units of that distance per second.
- Values of different kinds in one track hold the first until the second arrives.

**`splitClip` and animation:** a keyframe segment that spans the cut is split in two (the temporal and spatial curves are cut with De Casteljau), so each half continues exactly as the original did: the first half gets a keyframe at the cut, the second half one at its time 0. A keyframe exactly on the cut stays in both halves. A half left with no keyframes for a property keeps it constant at the value it had there (written into its static value).

## Assets, compositions, tracks, markers
`addAsset`/`removeAsset` (removal fails with `asset_in_use` while any clip references it), `updateAsset` (+`unset`), `addComposition`/`removeComposition` (removal fails while a `composition` clip references it, and when it is the main composition), `updateComposition`, `addTrack`/`removeTrack`/`reorderTrack`/`setTrackProps`, `addMarker`/`updateMarker`/`removeMarker`. `add*` ops take an optional `index` so their inverse restores the exact position.

## Error codes
`unknown_composition`, `unknown_track`, `unknown_clip`, `unknown_asset`, `unknown_marker`, `unknown_effect`, `unknown_mask`, `unknown_keyframe`, `invalid_property`, `duplicate_id`, `track_locked`, `wrong_track_kind`, `clips_overlap`, `invalid_range`, `invalid_time`, `invalid_speed`, `trim_beyond_source`, `not_adjacent`, `split_out_of_range`, `link_id_in_use`, `asset_in_use`, `composition_in_use`, `composition_cycle`, `keyframe_exists`, `not_a_paint_clip`, `invalid_op`.
