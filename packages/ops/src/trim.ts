import type { Clip } from "@lumacut/schema";
import { assertTime, fail } from "./errors.ts";
import { splitClipKeyframes } from "./keyframes/split.ts";
import { clone, endOf } from "./model.ts";

/** Source time that `timelineUs` of timeline covers at this clip's speed. */
const toSource = (timelineUs: number, speed: number): number => Math.round(timelineUs * speed);

function checked(clip: Clip): Clip {
  if (clip.inUs < 0 || clip.outUs < 0) {
    fail("trim_beyond_source", `Can't extend clip ${clip.id} before the start of its media.`);
  }
  if (clip.outUs <= clip.inUs) fail("invalid_range", `Clip ${clip.id} would have no length left.`);
  return clip;
}

/**
 * Moves the start edge to `toUs` without moving the end: later start = head cut off, earlier =
 * head extended. The source in point (out point if reversed) follows.
 */
export function withStart(clip: Clip, toUs: number): Clip {
  assertTime(toUs, "The new start");
  if (toUs >= endOf(clip))
    fail("invalid_range", `The start of clip ${clip.id} must stay before its end.`);
  const source = toSource(toUs - clip.startUs, clip.speed);
  const next: Clip = { ...clip, startUs: toUs };
  if (clip.reversed) next.outUs = clip.outUs - source;
  else next.inUs = clip.inUs + source;
  return checked(next);
}

/** Moves the end edge to `toUs` without moving the start. */
export function withEnd(clip: Clip, toUs: number): Clip {
  assertTime(toUs, "The new end");
  if (toUs <= clip.startUs)
    fail("invalid_range", `The end of clip ${clip.id} must stay after its start.`);
  const source = toSource(toUs - clip.startUs, clip.speed);
  const next: Clip = { ...clip };
  if (clip.reversed) next.inUs = clip.outUs - source;
  else next.outUs = clip.inUs + source;
  return checked(next);
}

/** Cuts a clip in two at a timeline time; the second half gets `newId` (see docs/ops.md). */
export function splitClipAt(clip: Clip, atUs: number, newId: string): [Clip, Clip] {
  assertTime(atUs, "The split time");
  if (!(atUs > clip.startUs && atUs < endOf(clip))) {
    fail("split_out_of_range", `The split time must fall inside clip ${clip.id}.`);
  }
  const offset = atUs - clip.startUs;
  const source = toSource(offset, clip.speed);
  if (source <= 0 || source >= clip.outUs - clip.inUs) {
    fail("split_out_of_range", `The split time is too close to an edge of clip ${clip.id}.`);
  }

  const first: Clip = clone(clip);
  const second: Clip = clone(clip);
  if (clip.reversed) {
    first.inUs = clip.outUs - source;
    second.outUs = clip.outUs - source;
  } else {
    first.outUs = clip.inUs + source;
    second.inUs = clip.inUs + source;
  }
  second.id = newId;
  second.startUs = atUs;
  delete second.transitionIn;
  delete second.linkId;
  delete second.placeholder;

  // Keyframe times are clip-local: each half keeps its part of every animation (a segment that
  // spans the cut is split so neither half jumps), and the second half's restarts at its own start.
  const [head, tail] = splitClipKeyframes(clip, first, second, offset);
  if (clip.audio !== undefined) {
    const audio = head.audio ?? clip.audio;
    head.audio = { ...audio, fadeOutUs: 0 };
    tail.audio = { ...(tail.audio ?? clip.audio), fadeInUs: 0 };
  }
  return [head, tail];
}
