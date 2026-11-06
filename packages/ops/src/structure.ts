import type {
  Asset,
  AssetPatch,
  AssetUnsettable,
  Composition,
  CompositionPatch,
  Marker,
  Op,
  Project,
  Track,
  TrackPatch,
} from "@lumacut/schema";
import { fail } from "./errors.ts";
import {
  allClips,
  assertUnlocked,
  needComposition,
  needTrack,
  setComposition,
} from "./model.ts";

type OpOf<T extends Op["type"]> = Extract<Op, { type: T }>;

/** A structural edit with its exact inverse (these ops don't need the diff). */
export interface Structural {
  project: Project;
  inverse: Op;
  touched: string[];
}

function insertAt<T>(list: readonly T[], item: T, index: number | undefined, what: string): T[] {
  const at = index ?? list.length;
  if (at > list.length) fail("invalid_range", `Can't insert the ${what} at position ${String(at)}; there are only ${String(list.length)}.`);
  return [...list.slice(0, at), item, ...list.slice(at)];
}

/** Previous values for the keys a patch touches, so applying them again undoes it. */
function previousValues<T extends object>(current: T, patch: Partial<T>): { props: Partial<T>; unset: string[] } {
  const props: Record<string, unknown> = {};
  const unset: string[] = [];
  const before = current as Record<string, unknown>;
  for (const key of Object.keys(patch)) {
    if (before[key] === undefined) unset.push(key);
    else props[key] = before[key];
  }
  return { props: props as Partial<T>, unset };
}

// --- Compositions -----------------------------------------------------------------------------

export function addComposition(project: Project, op: OpOf<"addComposition">): Structural {
  if (project.compositions.some((c) => c.id === op.composition.id)) {
    fail("duplicate_id", `A composition with the id "${op.composition.id}" already exists.`);
  }
  const compositions = insertAt(project.compositions, op.composition, op.index, "composition");
  return {
    project: { ...project, compositions },
    inverse: { type: "removeComposition", compositionId: op.composition.id },
    touched: [op.composition.id],
  };
}

export function removeComposition(project: Project, op: OpOf<"removeComposition">): Structural {
  const { composition, index } = needComposition(project, op.compositionId);
  if (project.mainCompositionId === composition.id) {
    fail("composition_in_use", `"${composition.name}" is the project's main composition and can't be removed.`);
  }
  if (allClips(project).some((c) => c.compositionId === composition.id)) {
    fail("composition_in_use", `"${composition.name}" is used as a nested composition. Remove those clips first.`);
  }
  return {
    project: { ...project, compositions: project.compositions.filter((c) => c.id !== composition.id) },
    inverse: { type: "addComposition", composition, index },
    touched: [],
  };
}

export function updateComposition(project: Project, op: OpOf<"updateComposition">): Structural {
  const { composition, index } = needComposition(project, op.compositionId);
  const { props } = previousValues(composition as Composition, op.props);
  return {
    project: setComposition(project, index, { ...composition, ...op.props }),
    inverse: {
      type: "updateComposition",
      compositionId: composition.id,
      props: props as CompositionPatch,
    },
    touched: [composition.id],
  };
}

// --- Tracks -----------------------------------------------------------------------------------

export function addTrack(project: Project, op: OpOf<"addTrack">): Structural {
  const { composition, index } = needComposition(project, op.compositionId);
  if (composition.tracks.some((t) => t.id === op.track.id) || project.compositions.some((c) => c.tracks.some((t) => t.id === op.track.id))) {
    fail("duplicate_id", `A track with the id "${op.track.id}" already exists.`);
  }
  const tracks = insertAt(composition.tracks, op.track, op.index, "track");
  return {
    project: setComposition(project, index, { ...composition, tracks }),
    inverse: { type: "removeTrack", compositionId: composition.id, trackId: op.track.id },
    touched: [composition.id],
  };
}

export function removeTrack(project: Project, op: OpOf<"removeTrack">): Structural {
  const { composition, compIndex, track, trackIndex } = needTrack(project, op.trackId);
  if (composition.id !== op.compositionId) fail("unknown_track", `Track "${op.trackId}" isn't in composition "${op.compositionId}".`);
  assertUnlocked(track);
  return {
    project: setComposition(project, compIndex, {
      ...composition,
      tracks: composition.tracks.filter((t) => t.id !== track.id),
    }),
    inverse: { type: "addTrack", compositionId: composition.id, track, index: trackIndex },
    touched: [composition.id],
  };
}

export function reorderTrack(project: Project, op: OpOf<"reorderTrack">): Structural {
  const { composition, compIndex, track, trackIndex } = needTrack(project, op.trackId);
  if (composition.id !== op.compositionId) fail("unknown_track", `Track "${op.trackId}" isn't in composition "${op.compositionId}".`);
  if (op.toIndex >= composition.tracks.length) {
    fail("invalid_range", `There is no position ${String(op.toIndex)}; the composition has ${String(composition.tracks.length)} tracks.`);
  }
  const rest = composition.tracks.filter((t) => t.id !== track.id);
  const tracks = [...rest.slice(0, op.toIndex), track, ...rest.slice(op.toIndex)];
  return {
    project: setComposition(project, compIndex, { ...composition, tracks }),
    inverse: { type: "reorderTrack", compositionId: composition.id, trackId: track.id, toIndex: trackIndex },
    touched: [composition.id],
  };
}

export function setTrackProps(project: Project, op: OpOf<"setTrackProps">): Structural {
  const { composition, compIndex, track, trackIndex } = needTrack(project, op.trackId);
  const { props } = previousValues(track as Track, op.props);
  return {
    project: setComposition(project, compIndex, {
      ...composition,
      tracks: composition.tracks.map((t, i) => (i === trackIndex ? { ...t, ...op.props } : t)),
    }),
    inverse: { type: "setTrackProps", trackId: track.id, props: props as TrackPatch },
    touched: [composition.id],
  };
}

// --- Assets -----------------------------------------------------------------------------------

export function addAsset(project: Project, op: OpOf<"addAsset">): Structural {
  if (project.assets.some((a) => a.id === op.asset.id)) {
    fail("duplicate_id", `An asset with the id "${op.asset.id}" already exists.`);
  }
  return {
    project: { ...project, assets: insertAt(project.assets, op.asset, op.index, "asset") },
    inverse: { type: "removeAsset", assetId: op.asset.id },
    touched: [],
  };
}

export function removeAsset(project: Project, op: OpOf<"removeAsset">): Structural {
  const index = project.assets.findIndex((a) => a.id === op.assetId);
  const asset = project.assets[index];
  if (asset === undefined) fail("unknown_asset", `There is no asset "${op.assetId}".`);
  if (allClips(project).some((c) => c.assetId === asset.id)) {
    fail("asset_in_use", `"${asset.name}" is used by clips in this project. Remove them first.`);
  }
  return {
    project: { ...project, assets: project.assets.filter((a) => a.id !== asset.id) },
    inverse: { type: "addAsset", asset, index },
    touched: [],
  };
}

export function updateAsset(project: Project, op: OpOf<"updateAsset">): Structural {
  const index = project.assets.findIndex((a) => a.id === op.assetId);
  const asset = project.assets[index];
  if (asset === undefined) fail("unknown_asset", `There is no asset "${op.assetId}".`);
  const { props, unset } = previousValues(asset as Asset, op.props);
  const next = { ...asset, ...op.props } as Record<string, unknown>;
  for (const key of op.unset ?? []) delete next[key];
  // Undoing must also restore anything this update removed.
  for (const key of op.unset ?? []) {
    const previous = (asset as Record<string, unknown>)[key];
    if (previous !== undefined) (props as Record<string, unknown>)[key] = previous;
  }
  return {
    project: { ...project, assets: project.assets.map((a, i) => (i === index ? (next as unknown as Asset) : a)) },
    inverse: {
      type: "updateAsset",
      assetId: asset.id,
      props: props as AssetPatch,
      ...(unset.length > 0 ? { unset: unset as AssetUnsettable[] } : {}),
    },
    touched: [],
  };
}

// --- Markers ----------------------------------------------------------------------------------

function markerIndex(markers: readonly Marker[], id: string): number {
  const index = markers.findIndex((m) => m.id === id);
  if (index < 0) fail("unknown_marker", `There is no marker "${id}".`);
  return index;
}

export function addMarker(project: Project, op: OpOf<"addMarker">): Structural {
  const { composition, index } = needComposition(project, op.compositionId);
  if (composition.markers.some((m) => m.id === op.marker.id)) {
    fail("duplicate_id", `A marker with the id "${op.marker.id}" already exists.`);
  }
  const markers = insertAt(composition.markers, op.marker, op.index, "marker");
  return {
    project: setComposition(project, index, { ...composition, markers }),
    inverse: { type: "removeMarker", compositionId: composition.id, markerId: op.marker.id },
    touched: [],
  };
}

export function updateMarker(project: Project, op: OpOf<"updateMarker">): Structural {
  const { composition, index } = needComposition(project, op.compositionId);
  const at = markerIndex(composition.markers, op.marker.id);
  const previous = composition.markers[at] as Marker;
  return {
    project: setComposition(project, index, {
      ...composition,
      markers: composition.markers.map((m, i) => (i === at ? op.marker : m)),
    }),
    inverse: { type: "updateMarker", compositionId: composition.id, marker: previous },
    touched: [],
  };
}

export function removeMarker(project: Project, op: OpOf<"removeMarker">): Structural {
  const { composition, index } = needComposition(project, op.compositionId);
  const at = markerIndex(composition.markers, op.markerId);
  const marker = composition.markers[at] as Marker;
  return {
    project: setComposition(project, index, {
      ...composition,
      markers: composition.markers.filter((m) => m.id !== marker.id),
    }),
    inverse: { type: "addMarker", compositionId: composition.id, marker, index: at },
    touched: [],
  };
}
