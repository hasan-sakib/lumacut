export { applyOp, hasClip, type ApplyResult } from "./apply.ts";
export { contentEndUs, durationOps } from "./durations.ts";
export { OP_ERROR_CODES, OpError, type OpErrorCode } from "./errors.ts";
export {
  endOf,
  findClip,
  findTrack,
  lengthOf,
  needClip,
  needComposition,
  needTrack,
} from "./model.ts";
export { findCompositionCycle, validateProject } from "./validate.ts";
export {
  EASE_PRESETS,
  EASE_PRESET_INFO,
  animatedClip,
  applyEasePreset,
  easePresetOps,
  isBakedPreset,
  keyframeOps,
  segmentInfo,
  speedProfile,
  evaluate,
  evaluateFrames,
  isAnimated,
  kindOf,
  localTime,
  resolveProperty,
  splitFrames,
  valueFitsKind,
  type AnimatableProperty,
  type EasePreset,
  type SegmentInfo,
  type ValueKind,
} from "./keyframes/index.ts";
export {
  DEFAULT_ANCHOR,
  MOTION_PRESETS,
  presetById,
  presetOps,
  seeded,
  setFrames,
  type ApplyPresetOptions,
  type MotionPreset,
  type PresetCategory,
  type PresetContext,
} from "./presets/index.ts";
