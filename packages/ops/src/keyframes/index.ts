export { animatedClip, evaluate, isAnimated, localTime } from "./evaluate.ts";
export { resolveProperty, valueFitsKind, type AnimatableProperty } from "./paths.ts";
export { evaluateFrames, segmentInfo, speedProfile, type SegmentInfo } from "./segment.ts";
export { splitFrames } from "./split.ts";
export { kindOf, type ValueKind } from "./values.ts";
export {
  EASE_PRESETS,
  EASE_PRESET_INFO,
  applyEasePreset,
  easePresetOps,
  isBakedPreset,
  keyframeOps,
  type EasePreset,
} from "./presets.ts";
