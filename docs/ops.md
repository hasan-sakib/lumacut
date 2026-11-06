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
Plain list edits with no evaluation (M4a/M5): keyframes are kept sorted by `tUs`, one per `tUs` per path; masks and effects are addressed by their ids (unique within the clip); `setTransition` sets or clears `transitionIn` (its length may not exceed the clip's); paint ops require a `paint` clip.

**Keyframe time base (decision to confirm before M4a):** `Keyframe.tUs` is **relative to the clip's `startUs`** (clip-local). Moving a clip moves its animation with it; trimming the head does not retime keyframes. `splitClip` gives the first half keyframes with `tUs < offset` and the second half those `≥ offset`, shifted by `−offset`. No boundary keyframe is inserted at the cut, so a split mid-animation can jump; M4a decides whether to add interpolated boundary keyframes. The spec doesn't say which time base keyframes use.

## Assets, compositions, tracks, markers
`addAsset`/`removeAsset` (removal fails with `asset_in_use` while any clip references it), `updateAsset` (+`unset`), `addComposition`/`removeComposition` (removal fails while a `composition` clip references it, and when it is the main composition), `updateComposition`, `addTrack`/`removeTrack`/`reorderTrack`/`setTrackProps`, `addMarker`/`updateMarker`/`removeMarker`. `add*` ops take an optional `index` so their inverse restores the exact position.

## Error codes
`unknown_composition`, `unknown_track`, `unknown_clip`, `unknown_asset`, `unknown_marker`, `unknown_effect`, `unknown_mask`, `unknown_keyframe`, `duplicate_id`, `track_locked`, `wrong_track_kind`, `clips_overlap`, `invalid_range`, `invalid_time`, `invalid_speed`, `trim_beyond_source`, `not_adjacent`, `split_out_of_range`, `link_id_in_use`, `asset_in_use`, `composition_in_use`, `composition_cycle`, `keyframe_exists`, `not_a_paint_clip`, `invalid_op`.
