import {
  createClip,
  createComposition,
  createTrack,
  type Clip,
  type Op,
  type Project,
  type Track,
} from "@lumacut/schema";
import { assertTime, fail } from "./errors.ts";
import {
  allClips,
  assertUnlocked,
  clone,
  endOf,
  lengthOf,
  mapClip,
  needClip,
  needComposition,
  needTrack,
  setComposition,
  setTrack,
} from "./model.ts";
import { editClipData, type Edit } from "./clipdata-edit.ts";
import { splitClipAt, withEnd, withStart } from "./trim.ts";

type OpOf<T extends Op["type"]> = Extract<Op, { type: T }>;

function assertFreeId(project: Project, id: string): void {
  if (allClips(project).some((c) => c.id === id))
    fail("duplicate_id", `A clip with the id "${id}" already exists.`);
}

function withClips(
  project: Project,
  ref: { compIndex: number; trackIndex: number; track: Track },
  clips: Clip[],
): Project {
  return setTrack(project, ref, { ...ref.track, clips });
}

// --- Add, remove, move ------------------------------------------------------------------------

export function addClip(project: Project, op: OpOf<"addClip">): Edit {
  const ref = needTrack(project, op.trackId);
  assertUnlocked(ref.track);
  assertFreeId(project, op.clip.id);
  return {
    project: withClips(project, ref, [...ref.track.clips, op.clip]),
    touched: [ref.composition.id],
  };
}

export function removeClip(project: Project, op: OpOf<"removeClip">): Edit {
  const ref = needClip(project, op.clipId);
  assertUnlocked(ref.track);
  return {
    project: withClips(
      project,
      ref,
      ref.track.clips.filter((c) => c.id !== op.clipId),
    ),
    touched: [ref.composition.id],
  };
}

export function moveClip(project: Project, op: OpOf<"moveClip">): Edit {
  assertTime(op.startUs, "The new start");
  const from = needClip(project, op.clipId);
  const to = needTrack(project, op.trackId);
  assertUnlocked(from.track);
  assertUnlocked(to.track);
  const moved: Clip = { ...from.clip, startUs: op.startUs };
  if (from.track.id === to.track.id) {
    return { project: mapClip(project, from, () => moved), touched: [from.composition.id] };
  }
  const removed = withClips(
    project,
    from,
    from.track.clips.filter((c) => c.id !== op.clipId),
  );
  // `to` was located in the original project; re-find it so a same-composition move keeps both edits.
  const target = needTrack(removed, op.trackId);
  return {
    project: withClips(removed, target, [...target.track.clips, moved]),
    touched: [from.composition.id, to.composition.id],
  };
}

// --- The trim family --------------------------------------------------------------------------

/** Clips on the same track that begin at or after `fromUs`, other than `except`. */
const laterClips = (track: Track, fromUs: number, except: string): Clip[] =>
  track.clips.filter((c) => c.id !== except && c.startUs >= fromUs);

function shiftClips(clips: Clip[], ids: Set<string>, delta: number): Clip[] {
  return clips.map((c) => {
    if (!ids.has(c.id)) return c;
    const startUs = c.startUs + delta;
    assertTime(startUs, `The new start of clip ${c.id}`);
    return { ...c, startUs };
  });
}

export function trimClip(project: Project, op: OpOf<"trimClip">): Edit {
  return editClipData(project, op.clipId, (c) =>
    op.edge === "start" ? withStart(c, op.toUs) : withEnd(c, op.toUs),
  );
}

export function rippleTrim(project: Project, op: OpOf<"rippleTrim">): Edit {
  const ref = needClip(project, op.clipId);
  assertUnlocked(ref.track);
  const { clip } = ref;
  const oldEnd = endOf(clip);
  let trimmed: Clip;
  if (op.edge === "end") {
    trimmed = withEnd(clip, op.toUs);
  } else {
    // The head is cut (or extended) in place: the clip keeps its start, later clips follow its length.
    trimmed = { ...withStart(clip, op.toUs), startUs: clip.startUs };
  }
  const delta = lengthOf(trimmed) - lengthOf(clip);
  const later = new Set(laterClips(ref.track, oldEnd, clip.id).map((c) => c.id));
  const clips = shiftClips(
    ref.track.clips.map((c) => (c.id === clip.id ? trimmed : c)),
    later,
    delta,
  );
  return { project: withClips(project, ref, clips), touched: [ref.composition.id] };
}

export function rollEdit(project: Project, op: OpOf<"rollEdit">): Edit {
  const left = needClip(project, op.leftClipId);
  const right = needClip(project, op.rightClipId);
  if (left.track.id !== right.track.id) {
    fail("not_adjacent", "Both clips of a roll edit must be on the same track.");
  }
  assertUnlocked(left.track);
  if (endOf(left.clip) !== right.clip.startUs) {
    fail("not_adjacent", `Clip ${left.clip.id} doesn't end where clip ${right.clip.id} begins.`);
  }
  const newLeft = withEnd(left.clip, op.toUs);
  const newRight = withStart(right.clip, op.toUs);
  const clips = left.track.clips.map((c) =>
    c.id === newLeft.id ? newLeft : c.id === newRight.id ? newRight : c,
  );
  return { project: withClips(project, left, clips), touched: [left.composition.id] };
}

export function slipClip(project: Project, op: OpOf<"slipClip">): Edit {
  return editClipData(project, op.clipId, (c) => {
    const inUs = c.inUs + op.deltaUs;
    const outUs = c.outUs + op.deltaUs;
    if (inUs < 0)
      fail("trim_beyond_source", `Can't slip clip ${c.id} before the start of its media.`);
    return { ...c, inUs, outUs };
  });
}

export function slideClip(project: Project, op: OpOf<"slideClip">): Edit {
  const ref = needClip(project, op.clipId);
  assertUnlocked(ref.track);
  const { clip } = ref;
  const end = endOf(clip);
  const newStart = clip.startUs + op.deltaUs;
  assertTime(newStart, "The new start");
  const previous = ref.track.clips.find((c) => c.id !== clip.id && endOf(c) === clip.startUs);
  const next = ref.track.clips.find((c) => c.id !== clip.id && c.startUs === end);
  const clips = ref.track.clips.map((c) => {
    if (c.id === clip.id) return { ...c, startUs: newStart };
    if (c.id === previous?.id) return withEnd(c, newStart);
    if (c.id === next?.id) return withStart(c, end + op.deltaUs);
    return c;
  });
  return { project: withClips(project, ref, clips), touched: [ref.composition.id] };
}

export function splitClip(project: Project, op: OpOf<"splitClip">): Edit {
  const ref = needClip(project, op.clipId);
  assertUnlocked(ref.track);
  assertFreeId(project, op.newClipId);
  const [first, second] = splitClipAt(ref.clip, op.atUs, op.newClipId);
  const clips = ref.track.clips.flatMap((c) => (c.id === first.id ? [first, second] : [c]));
  return { project: withClips(project, ref, clips), touched: [ref.composition.id] };
}

// --- Ripple delete ----------------------------------------------------------------------------

function rippleDeleteClips(project: Project, compositionId: string, clipIds: string[]): Edit {
  const { composition } = needComposition(project, compositionId);
  const doomed = new Set(clipIds);
  let next = project;
  for (const id of doomed) {
    const ref = needClip(project, id);
    if (ref.composition.id !== compositionId)
      fail("unknown_clip", `Clip "${id}" isn't in composition "${compositionId}".`);
    assertUnlocked(ref.track);
  }
  for (const track of composition.tracks) {
    const removed = track.clips.filter((c) => doomed.has(c.id));
    if (removed.length === 0) continue;
    const kept = track.clips
      .filter((c) => !doomed.has(c.id))
      .map((c) => {
        const gap = removed
          .filter((r) => endOf(r) <= c.startUs)
          .reduce((sum, r) => sum + lengthOf(r), 0);
        return gap === 0 ? c : { ...c, startUs: c.startUs - gap };
      });
    const ref = needTrack(next, track.id);
    next = withClips(next, ref, kept);
  }
  return { project: next, touched: [compositionId] };
}

function rippleDeleteRange(
  project: Project,
  compositionId: string,
  startUs: number,
  endUs: number,
  trackIds: string[],
): Edit {
  assertTime(startUs, "The start of the range");
  assertTime(endUs, "The end of the range");
  if (endUs <= startUs) fail("invalid_range", "The range to delete must have a length.");
  const length = endUs - startUs;
  let next = project;
  for (const trackId of trackIds) {
    const ref = needTrack(next, trackId);
    if (ref.composition.id !== compositionId)
      fail("unknown_track", `Track "${trackId}" isn't in composition "${compositionId}".`);
    assertUnlocked(ref.track);
    const clips: Clip[] = [];
    for (const c of ref.track.clips) {
      const cs = c.startUs;
      const ce = endOf(c);
      if (ce <= startUs) clips.push(c);
      else if (cs >= endUs) clips.push({ ...c, startUs: cs - length });
      else if (cs >= startUs && ce <= endUs) continue;
      else if (cs < startUs && ce > endUs) {
        const tailId = `${c.id}-r${String(endUs)}`.slice(0, 64);
        if (allClips(next).some((x) => x.id === tailId))
          fail("duplicate_id", `A clip with the id "${tailId}" already exists.`);
        const [head, tail] = splitClipAt(c, startUs, tailId);
        clips.push(head, { ...withStart(tail, endUs), startUs });
      } else if (cs < startUs) clips.push(withEnd(c, startUs));
      else clips.push({ ...withStart(c, endUs), startUs });
    }
    next = withClips(next, ref, clips);
  }
  return { project: next, touched: [compositionId] };
}

export function rippleDelete(project: Project, op: OpOf<"rippleDelete">): Edit {
  needComposition(project, op.compositionId);
  const target = op.target;
  return target.kind === "clips"
    ? rippleDeleteClips(project, op.compositionId, target.clipIds)
    : rippleDeleteRange(project, op.compositionId, target.startUs, target.endUs, target.trackIds);
}

// --- Properties, links, placeholders ----------------------------------------------------------

export function setProps(project: Project, op: OpOf<"setProps">): Edit {
  return editClipData(project, op.clipId, (c) => {
    const drop = new Set<string>(op.unset ?? []);
    const merged: Record<string, unknown> = { ...c, ...op.props };
    return Object.fromEntries(
      Object.entries(merged).filter(([key]) => !drop.has(key)),
    ) as unknown as Clip;
  });
}

export function linkClips(project: Project, op: OpOf<"linkClips">): Edit {
  const members = new Set(op.clipIds);
  if (allClips(project).some((c) => c.linkId === op.linkId && !members.has(c.id))) {
    fail("link_id_in_use", `The link "${op.linkId}" already groups other clips.`);
  }
  let next = project;
  const touched: string[] = [];
  for (const id of members) {
    const edit = editClipData(next, id, (c) => ({ ...c, linkId: op.linkId }));
    next = edit.project;
    touched.push(...edit.touched);
  }
  return { project: next, touched };
}

export function unlinkClips(project: Project, op: OpOf<"unlinkClips">): Edit {
  let next = project;
  const touched: string[] = [];
  for (const id of new Set(op.clipIds)) {
    const edit = editClipData(next, id, (c) => {
      const { linkId: _removed, ...rest } = c;
      return rest;
    });
    next = edit.project;
    touched.push(...edit.touched);
  }
  return { project: next, touched };
}

export function setPlaceholder(project: Project, op: OpOf<"setPlaceholder">): Edit {
  return editClipData(project, op.clipId, (c) => {
    const { placeholder: _removed, ...rest } = c;
    return op.placeholder === undefined ? rest : { ...rest, placeholder: op.placeholder };
  });
}

// --- Precompose -------------------------------------------------------------------------------

export interface PrecomposeEdit extends Edit {
  /** `project` without the new composition: what the diff-based inverse compares against. */
  withoutNew: Project;
}

export function precompose(project: Project, op: OpOf<"precompose">): PrecomposeEdit {
  const { composition, index } = needComposition(project, op.compositionId);
  if (project.compositions.some((c) => c.id === op.newCompositionId)) {
    fail("duplicate_id", `A composition with the id "${op.newCompositionId}" already exists.`);
  }
  assertFreeId(project, op.newClipId);
  const chosen = new Set(op.clipIds);
  for (const id of chosen) {
    const ref = needClip(project, id);
    if (ref.composition.id !== composition.id)
      fail("unknown_clip", `Clip "${id}" isn't in composition "${composition.id}".`);
    assertUnlocked(ref.track);
  }
  const involved = composition.tracks.filter((t) => t.clips.some((c) => chosen.has(c.id)));
  const picked = involved.flatMap((t) => t.clips.filter((c) => chosen.has(c.id)));
  const minStart = Math.min(...picked.map((c) => c.startUs));
  const maxEnd = Math.max(...picked.map((c) => endOf(c)));
  const host = involved.find((t) => t.kind === "visual");
  if (host === undefined) {
    fail(
      "wrong_track_kind",
      "Precompose needs at least one picture clip: a nested composition is a picture clip.",
    );
  }

  const innerTracks = involved.map((t, i) =>
    createTrack({
      id: `${op.newCompositionId.slice(0, 56)}-t${String(i)}`,
      name: t.name,
      kind: t.kind,
      clips: t.clips
        .filter((c) => chosen.has(c.id))
        .map((c) => ({ ...clone(c), startUs: c.startUs - minStart })),
    }),
  );
  const inner = createComposition({
    id: op.newCompositionId,
    name: op.newCompositionName,
    width: composition.width,
    height: composition.height,
    fps: composition.fps,
    background: composition.background,
    durationUs: maxEnd - minStart,
    tracks: innerTracks,
  });
  const nested = createClip({
    id: op.newClipId,
    type: "composition",
    compositionId: op.newCompositionId,
    startUs: minStart,
    inUs: 0,
    outUs: maxEnd - minStart,
  });

  const outer = {
    ...composition,
    tracks: composition.tracks.map((t) => {
      const kept = t.clips.filter((c) => !chosen.has(c.id));
      return t.id === host.id
        ? { ...t, clips: [...kept, nested] }
        : kept.length === t.clips.length
          ? t
          : { ...t, clips: kept };
    }),
  };
  const withoutNew = setComposition(project, index, outer);
  return {
    project: { ...withoutNew, compositions: [...withoutNew.compositions, inner] },
    withoutNew,
    touched: [composition.id, inner.id],
  };
}
