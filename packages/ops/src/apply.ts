import type { Op, Project } from "@lumacut/schema";
import * as clipdata from "./clipdata.ts";
import * as clips from "./clips.ts";
import type { Edit } from "./clipdata-edit.ts";
import { diffOps, inverseByDiff } from "./diff.ts";
import { fail } from "./errors.ts";
import { allClips, setComposition, sortTrack } from "./model.ts";
import * as structure from "./structure.ts";
import { validateTouched } from "./validate.ts";

export interface ApplyResult {
  project: Project;
  /** Applying this to `project` restores the project before the op, exactly. */
  inverse: Op;
}

type Step = ApplyResult;

/** Orders the clips of every track in the touched compositions (see docs/ops.md). */
function normalize(project: Project, touched: ReadonlySet<string>): Project {
  if (touched.size === 0) return project;
  let next = project;
  for (const [index, composition] of project.compositions.entries()) {
    if (!touched.has(composition.id)) continue;
    const tracks = composition.tracks.map(sortTrack);
    if (tracks.some((t, i) => t !== composition.tracks[i])) {
      next = setComposition(next, index, { ...composition, tracks });
    }
  }
  return next;
}

function applyInner(project: Project, op: Op, touched: Set<string>): Step {
  const byDiff = (edit: Edit): Step => {
    for (const id of edit.touched) touched.add(id);
    return { project: edit.project, inverse: inverseByDiff(project, edit.project) };
  };
  const direct = (s: structure.Structural): Step => {
    for (const id of s.touched) touched.add(id);
    return { project: s.project, inverse: s.inverse };
  };

  switch (op.type) {
    case "batch": {
      let current = project;
      const inverses: Op[] = [];
      for (const sub of op.ops) {
        const step = applyInner(current, sub, touched);
        current = step.project;
        inverses.push(step.inverse);
      }
      return {
        project: current,
        inverse: {
          type: "batch",
          ...(op.label === undefined ? {} : { label: op.label }),
          ops: inverses.reverse(),
        },
      };
    }

    // Compositions, tracks, assets, markers: natural inverses.
    case "addComposition":
      return direct(structure.addComposition(project, op));
    case "removeComposition":
      return direct(structure.removeComposition(project, op));
    case "updateComposition":
      return direct(structure.updateComposition(project, op));
    case "addTrack":
      return direct(structure.addTrack(project, op));
    case "removeTrack":
      return direct(structure.removeTrack(project, op));
    case "reorderTrack":
      return direct(structure.reorderTrack(project, op));
    case "setTrackProps":
      return direct(structure.setTrackProps(project, op));
    case "addAsset":
      return direct(structure.addAsset(project, op));
    case "removeAsset":
      return direct(structure.removeAsset(project, op));
    case "updateAsset": {
      const step = direct(structure.updateAsset(project, op));
      // A changed duration can invalidate the clips that use the asset.
      for (const c of project.compositions) {
        if (c.tracks.some((t) => t.clips.some((clip) => clip.assetId === op.assetId))) touched.add(c.id);
      }
      return step;
    }
    case "addMarker":
      return direct(structure.addMarker(project, op));
    case "updateMarker":
      return direct(structure.updateMarker(project, op));
    case "removeMarker":
      return direct(structure.removeMarker(project, op));

    // Clips: the inverse is the diff.
    case "addClip":
      return byDiff(clips.addClip(project, op));
    case "removeClip":
      return byDiff(clips.removeClip(project, op));
    case "moveClip":
      return byDiff(clips.moveClip(project, op));
    case "trimClip":
      return byDiff(clips.trimClip(project, op));
    case "rippleTrim":
      return byDiff(clips.rippleTrim(project, op));
    case "rollEdit":
      return byDiff(clips.rollEdit(project, op));
    case "slipClip":
      return byDiff(clips.slipClip(project, op));
    case "slideClip":
      return byDiff(clips.slideClip(project, op));
    case "splitClip":
      return byDiff(clips.splitClip(project, op));
    case "rippleDelete":
      return byDiff(clips.rippleDelete(project, op));
    case "setProps":
      return byDiff(clips.setProps(project, op));
    case "linkClips":
      return byDiff(clips.linkClips(project, op));
    case "unlinkClips":
      return byDiff(clips.unlinkClips(project, op));
    case "setPlaceholder":
      return byDiff(clips.setPlaceholder(project, op));
    case "addKeyframe":
      return byDiff(clipdata.addKeyframe(project, op));
    case "updateKeyframe":
      return byDiff(clipdata.updateKeyframe(project, op));
    case "removeKeyframe":
      return byDiff(clipdata.removeKeyframe(project, op));
    case "addMask":
      return byDiff(clipdata.addMask(project, op));
    case "updateMask":
      return byDiff(clipdata.updateMask(project, op));
    case "removeMask":
      return byDiff(clipdata.removeMask(project, op));
    case "addEffect":
      return byDiff(clipdata.addEffect(project, op));
    case "updateEffect":
      return byDiff(clipdata.updateEffect(project, op));
    case "removeEffect":
      return byDiff(clipdata.removeEffect(project, op));
    case "reorderEffect":
      return byDiff(clipdata.reorderEffect(project, op));
    case "setTransition":
      return byDiff(clipdata.setTransition(project, op));
    case "addPaintStrokes":
      return byDiff(clipdata.addPaintStrokes(project, op));
    case "removePaintStrokes":
      return byDiff(clipdata.removePaintStrokes(project, op));

    case "precompose": {
      const edit = clips.precompose(project, op);
      for (const id of edit.touched) touched.add(id);
      // The new composition isn't diffed: undo removes the nested clip, then the composition, then
      // puts the original clips back (that order keeps ids unique and references valid).
      const d = diffOps(project, edit.withoutNew);
      return {
        project: edit.project,
        inverse: {
          type: "batch",
          ops: [
            ...d.removes,
            { type: "removeComposition", compositionId: op.newCompositionId },
            ...d.moves,
            ...d.props,
            ...d.adds,
          ],
        },
      };
    }

    default: {
      const unknown: never = op;
      return fail("invalid_op", `Unknown op ${JSON.stringify(unknown)}.`);
    }
  }
}

/**
 * Applies one op (or a `batch`, atomically) to a project. Pure: the input is never modified and,
 * on any error, nothing is returned. Invariants are checked on the end state of the whole op.
 */
export function applyOp(project: Project, op: Op): ApplyResult {
  const touched = new Set<string>();
  const step = applyInner(project, op, touched);
  const next = normalize(step.project, touched);
  validateTouched(next, touched);
  return { project: next, inverse: step.inverse };
}

/** True when `clipId` exists anywhere in the project. */
export const hasClip = (project: Project, clipId: string): boolean =>
  allClips(project).some((c) => c.id === clipId);
