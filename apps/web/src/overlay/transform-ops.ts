import type { Op } from "@lumacut/schema";
import { animatedSetOp } from "../inspector/animation.ts";
import { fieldById, type ClipInfo } from "../inspector/fields.ts";
import { opForField } from "../inspector/selection.ts";

const POSITION = "transform.position";
const SCALE = "transform.scale";

/** Moves a clip: writes a keyframe at the playhead when its position is animated, else the static position. */
export function moveOp(info: ClipInfo, playheadUs: number, x: number, y: number): Op | null {
  const clip = info.clip;
  if ((clip.keyframes[POSITION]?.length ?? 0) > 0) {
    return animatedSetOp(fieldById("positionX"), clip, playheadUs, [x, y]);
  }
  return { type: "setProps", clipId: clip.id, props: { transform: { ...clip.transform, x, y } } };
}

export function scaleOp(info: ClipInfo, playheadUs: number, sx: number, sy: number): Op | null {
  const clip = info.clip;
  if ((clip.keyframes[SCALE]?.length ?? 0) > 0) {
    return animatedSetOp(fieldById("scaleX"), clip, playheadUs, [sx, sy]);
  }
  return {
    type: "setProps",
    clipId: clip.id,
    props: { transform: { ...clip.transform, scaleX: sx, scaleY: sy } },
  };
}

export function rotateOp(info: ClipInfo, playheadUs: number, degrees: number): Op | null {
  return opForField(fieldById("rotation"), degrees, [info], playheadUs);
}
