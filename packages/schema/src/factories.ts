/**
 * Constructors with neutral defaults. The schema itself has no defaults (a stored document is
 * always complete), so every place that builds a new project, track or clip uses these.
 *
 * Ids and timestamps are always passed in: factories never read the clock or a random source, so
 * they are safe to use in deterministic code and tests.
 */
import type { Asset } from "./asset.ts";
import type { Clip, ClipType, Transform } from "./clip.ts";
import type { ColorSettings } from "./color.ts";
import type { Composition, Track, TrackKind } from "./composition.ts";
import type { Color, IsoUtcDateTime, Rational } from "./primitives.ts";
import type { Project, ProjectKind } from "./project.ts";

export const BLACK: Color = { r: 0, g: 0, b: 0, a: 1 };
export const WHITE: Color = { r: 1, g: 1, b: 1, a: 1 };

/** A grade that changes nothing: every scalar and every wheel at 0. */
export function neutralColor(): ColorSettings {
  return {
    exposure: 0,
    contrast: 0,
    highlights: 0,
    shadows: 0,
    whites: 0,
    blacks: 0,
    temperature: 0,
    tint: 0,
    saturation: 0,
    vibrance: 0,
    lift: [0, 0, 0],
    gamma: [0, 0, 0],
    gain: [0, 0, 0],
    offset: [0, 0, 0],
  };
}

/** Layer's top-left corner at the composition origin; no scale, rotation or skew. */
export function identityTransform(): Transform {
  return { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0, anchorY: 0, skew: 0 };
}

/** Puts the middle of a layer of the given size in the middle of the composition. */
export function centeredTransform(
  comp: { width: number; height: number },
  layer: { width: number; height: number },
): Transform {
  return {
    ...identityTransform(),
    x: comp.width / 2,
    y: comp.height / 2,
    anchorX: layer.width / 2,
    anchorY: layer.height / 2,
  };
}

export interface ClipInit extends Partial<Omit<Clip, "id" | "type">> {
  id: string;
  type: ClipType;
}

/** A clip lasting one second at time 0 unless told otherwise. */
export function createClip(init: ClipInit): Clip {
  return {
    startUs: 0,
    inUs: 0,
    outUs: 1_000_000,
    speed: 1,
    reversed: false,
    transform: identityTransform(),
    opacity: 1,
    blendMode: "normal",
    crop: { left: 0, top: 0, right: 0, bottom: 0 },
    masks: [],
    color: neutralColor(),
    effects: [],
    motionBlur: { enabled: false, shutterAngle: 180, samples: 16 },
    keyframes: {},
    source: "user",
    ...init,
  };
}

export interface TrackInit extends Partial<Omit<Track, "id" | "kind">> {
  id: string;
  kind: TrackKind;
}

export function createTrack(init: TrackInit): Track {
  return {
    name: init.id,
    muted: false,
    locked: false,
    hidden: false,
    solo: false,
    clips: [],
    ...init,
  };
}

export interface CompositionInit extends Partial<Omit<Composition, "id" | "width" | "height">> {
  id: string;
  width: number;
  height: number;
}

export function createComposition(init: CompositionInit): Composition {
  const fps: Rational = { num: 30, den: 1 };
  return {
    name: init.id,
    fps,
    durationUs: 0,
    background: BLACK,
    tracks: [],
    markers: [],
    ...init,
  };
}

export interface ProjectInit extends Partial<Omit<Project, "id" | "schemaVersion" | "meta">> {
  id: string;
  /** Creation time, passed in (factories never read the clock). */
  now: IsoUtcDateTime;
  assets?: Asset[];
}

export function createProject(init: ProjectInit): Project {
  const { now, ...rest } = init;
  const compositions = rest.compositions ?? [];
  const kind: ProjectKind = "video";
  return {
    name: rest.id,
    kind,
    assets: [],
    compositions,
    mainCompositionId: compositions[0]?.id ?? "main",
    ...rest,
    schemaVersion: 1,
    meta: { createdAt: now, updatedAt: now, aiRuns: [] },
  };
}
