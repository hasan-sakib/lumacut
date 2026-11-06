import * as z from "zod";
import { Asset } from "./asset.ts";
import { Clip, PaintStroke, PlaceholderInfo } from "./clip.ts";
import { Composition, Marker, Track } from "./composition.ts";
import { EffectInstance, ParamValues, TransitionInstance } from "./effects.ts";
import { Keyframe } from "./keyframes.ts";
import { Mask } from "./masks.ts";
import { DeltaUs, Id, PropertyPath, TimeUs } from "./primitives.ts";
import { named } from "./registry.ts";

// Op payloads are structural only. Invariants (references exist, no overlaps, in < out, ...)
// are checked by applyOp in packages/ops, which also produces the inverse op.

const Index = z.int().min(0);
const ClipEdge = named("ClipEdge", z.enum(["start", "end"]));

/** Optional clip fields a patch may remove (a patch can't express "absent" by itself). */
export const ClipUnsettable = named(
  "ClipUnsettable",
  z.enum([
    "assetId",
    "compositionId",
    "freezeAtUs",
    "trackMatte",
    "audio",
    "text",
    "shape",
    "paint",
    "caption",
    "transitionIn",
    "linkId",
    "aiRunId",
    "placeholder",
  ]),
  "An optional clip field that setProps can remove.",
);
export type ClipUnsettable = z.infer<typeof ClipUnsettable>;

/** Optional asset fields a patch may remove. */
export const AssetUnsettable = named(
  "AssetUnsettable",
  z.enum(["aiRunId", "video", "audio", "image"]),
  "An optional asset field that updateAsset can remove.",
);
export type AssetUnsettable = z.infer<typeof AssetUnsettable>;

function op<T extends string, S extends z.core.$ZodLooseShape>(type: T, shape: S) {
  return named(
    `${type.charAt(0).toUpperCase()}${type.slice(1)}Op`,
    z.strictObject({ type: z.literal(type), ...shape }),
  );
}

// --- Patches (shallow: each present key replaces the old value) -----------------------------

export const CompositionPatch = named(
  "CompositionPatch",
  Composition.pick({
    name: true,
    width: true,
    height: true,
    fps: true,
    durationUs: true,
    background: true,
  }).partial(),
);
export type CompositionPatch = z.infer<typeof CompositionPatch>;

export const TrackPatch = named(
  "TrackPatch",
  Track.pick({ name: true, muted: true, locked: true, hidden: true, solo: true }).partial(),
);
export type TrackPatch = z.infer<typeof TrackPatch>;

export const ClipPatch = named("ClipPatch", Clip.omit({ id: true, type: true }).partial());
export type ClipPatch = z.infer<typeof ClipPatch>;

export const AssetPatch = named("AssetPatch", Asset.omit({ id: true, kind: true }).partial());
export type AssetPatch = z.infer<typeof AssetPatch>;

export const EffectPatch = named(
  "EffectPatch",
  z.strictObject({
    enabled: z.boolean().optional(),
    params: ParamValues.optional(),
  }),
  "params are merged key by key into the existing params.",
);
export type EffectPatch = z.infer<typeof EffectPatch>;

export const RippleDeleteClips = named(
  "RippleDeleteClips",
  z.strictObject({ kind: z.literal("clips"), clipIds: z.array(Id).min(1) }),
);

export const RippleDeleteRange = named(
  "RippleDeleteRange",
  z.strictObject({
    kind: z.literal("range"),
    startUs: TimeUs,
    endUs: TimeUs,
    trackIds: z.array(Id).min(1),
  }),
);

export const RippleDeleteTarget = named(
  "RippleDeleteTarget",
  z.discriminatedUnion("kind", [RippleDeleteClips, RippleDeleteRange]),
  "Delete whole clips, or a time range across tracks, and close the gap.",
);
export type RippleDeleteTarget = z.infer<typeof RippleDeleteTarget>;

// --- Compositions & tracks -------------------------------------------------------------------

export const AddCompositionOp = op("addComposition", {
  composition: Composition,
  /** Position in the project's list; appended when absent. */
  index: Index.optional(),
});
export const RemoveCompositionOp = op("removeComposition", { compositionId: Id });
export const UpdateCompositionOp = op("updateComposition", {
  compositionId: Id,
  props: CompositionPatch,
});
export const AddTrackOp = op("addTrack", { compositionId: Id, track: Track, index: Index });
export const RemoveTrackOp = op("removeTrack", { compositionId: Id, trackId: Id });
export const ReorderTrackOp = op("reorderTrack", {
  compositionId: Id,
  trackId: Id,
  toIndex: Index,
});
export const SetTrackPropsOp = op("setTrackProps", { trackId: Id, props: TrackPatch });

// --- Clips & editing -------------------------------------------------------------------------

export const AddClipOp = op("addClip", { trackId: Id, clip: Clip });
export const RemoveClipOp = op("removeClip", { clipId: Id });
export const MoveClipOp = op("moveClip", { clipId: Id, trackId: Id, startUs: TimeUs });
export const TrimClipOp = op("trimClip", { clipId: Id, edge: ClipEdge, toUs: TimeUs });
export const RippleTrimOp = op("rippleTrim", { clipId: Id, edge: ClipEdge, toUs: TimeUs });
export const RollEditOp = op("rollEdit", { leftClipId: Id, rightClipId: Id, toUs: TimeUs });
export const SlipClipOp = op("slipClip", { clipId: Id, deltaUs: DeltaUs });
export const SlideClipOp = op("slideClip", { clipId: Id, deltaUs: DeltaUs });
export const SplitClipOp = op("splitClip", { clipId: Id, atUs: TimeUs, newClipId: Id });
export const RippleDeleteOp = op("rippleDelete", {
  compositionId: Id,
  target: RippleDeleteTarget,
});
export const SetPropsOp = op("setProps", {
  clipId: Id,
  props: ClipPatch,
  /** Optional fields to remove, applied after `props`. */
  unset: z.array(ClipUnsettable).optional(),
});
export const LinkClipsOp = op("linkClips", { clipIds: z.array(Id).min(2), linkId: Id });
export const UnlinkClipsOp = op("unlinkClips", { clipIds: z.array(Id).min(1) });
export const SetPlaceholderOp = op("setPlaceholder", {
  clipId: Id,
  placeholder: PlaceholderInfo.optional(),
});
export const PrecomposeOp = op("precompose", {
  compositionId: Id,
  clipIds: z.array(Id).min(1),
  newCompositionId: Id,
  newCompositionName: z.string(),
  newClipId: Id,
});

// --- Keyframes, masks, effects, transitions, paint -------------------------------------------

export const AddKeyframeOp = op("addKeyframe", {
  clipId: Id,
  path: PropertyPath,
  keyframe: Keyframe,
});
export const UpdateKeyframeOp = op("updateKeyframe", {
  clipId: Id,
  path: PropertyPath,
  tUs: TimeUs,
  keyframe: Keyframe,
});
export const RemoveKeyframeOp = op("removeKeyframe", {
  clipId: Id,
  path: PropertyPath,
  tUs: TimeUs,
});
export const AddMaskOp = op("addMask", { clipId: Id, mask: Mask, index: Index.optional() });
export const UpdateMaskOp = op("updateMask", { clipId: Id, maskId: Id, mask: Mask });
export const RemoveMaskOp = op("removeMask", { clipId: Id, maskId: Id });
export const AddEffectOp = op("addEffect", {
  clipId: Id,
  effect: EffectInstance,
  index: Index.optional(),
});
export const UpdateEffectOp = op("updateEffect", {
  clipId: Id,
  effectId: Id,
  props: EffectPatch,
});
export const RemoveEffectOp = op("removeEffect", { clipId: Id, effectId: Id });
export const ReorderEffectOp = op("reorderEffect", { clipId: Id, effectId: Id, toIndex: Index });
export const SetTransitionOp = op("setTransition", {
  clipId: Id,
  transition: TransitionInstance.optional(),
});
export const AddPaintStrokesOp = op("addPaintStrokes", {
  clipId: Id,
  strokes: z.array(PaintStroke).min(1),
});
export const RemovePaintStrokesOp = op("removePaintStrokes", {
  clipId: Id,
  strokeIds: z.array(Id).min(1),
});

// --- Assets & markers ------------------------------------------------------------------------

export const AddAssetOp = op("addAsset", { asset: Asset, index: Index.optional() });
export const RemoveAssetOp = op("removeAsset", { assetId: Id });
export const UpdateAssetOp = op("updateAsset", {
  assetId: Id,
  props: AssetPatch,
  unset: z.array(AssetUnsettable).optional(),
});
export const AddMarkerOp = op("addMarker", {
  compositionId: Id,
  marker: Marker,
  /** Position in the composition's marker list; appended when absent. */
  index: Index.optional(),
});
export const UpdateMarkerOp = op("updateMarker", { compositionId: Id, marker: Marker });
export const RemoveMarkerOp = op("removeMarker", { compositionId: Id, markerId: Id });

// --- Union -----------------------------------------------------------------------------------

const leafOps = [
  AddCompositionOp,
  RemoveCompositionOp,
  UpdateCompositionOp,
  AddTrackOp,
  RemoveTrackOp,
  ReorderTrackOp,
  SetTrackPropsOp,
  AddClipOp,
  RemoveClipOp,
  MoveClipOp,
  TrimClipOp,
  RippleTrimOp,
  RollEditOp,
  SlipClipOp,
  SlideClipOp,
  SplitClipOp,
  RippleDeleteOp,
  SetPropsOp,
  LinkClipsOp,
  UnlinkClipsOp,
  SetPlaceholderOp,
  PrecomposeOp,
  AddKeyframeOp,
  UpdateKeyframeOp,
  RemoveKeyframeOp,
  AddMaskOp,
  UpdateMaskOp,
  RemoveMaskOp,
  AddEffectOp,
  UpdateEffectOp,
  RemoveEffectOp,
  ReorderEffectOp,
  SetTransitionOp,
  AddPaintStrokesOp,
  RemovePaintStrokesOp,
  AddAssetOp,
  RemoveAssetOp,
  UpdateAssetOp,
  AddMarkerOp,
  UpdateMarkerOp,
  RemoveMarkerOp,
] as const;

type LeafOp = z.infer<(typeof leafOps)[number]>;
export interface BatchOp {
  type: "batch";
  label?: string | undefined;
  ops: Op[];
}
export type Op = LeafOp | BatchOp;

// Built without op(): spreading the shape would evaluate the lazy `ops` getter before Op exists.
export const BatchOp = named(
  "BatchOp",
  z.strictObject({
    type: z.literal("batch"),
    label: z.string().optional(),
    get ops(): z.ZodArray<z.ZodType<Op>> {
      return z.array(Op);
    },
  }),
);

export const Op: z.ZodType<Op> = named(
  "Op",
  z.discriminatedUnion("type", [...leafOps, BatchOp]),
  "A single, atomic change to a project. batch applies its ops atomically as one undo step.",
);

/** Every op discriminator, in declaration order. */
export const OP_TYPES = [...leafOps.map((s) => s.shape.type.value), "batch"] as const;
