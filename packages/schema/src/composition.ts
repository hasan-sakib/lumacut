import * as z from "zod";
import { Clip } from "./clip.ts";
import { Color, Id, Rational, TimeUs } from "./primitives.ts";
import { named } from "./registry.ts";

export const Marker = named(
  "Marker",
  z.strictObject({
    id: Id,
    tUs: TimeUs,
    durationUs: TimeUs,
    label: z.string(),
    color: Color,
  }),
);
export type Marker = z.infer<typeof Marker>;

export const TrackKind = named("TrackKind", z.enum(["visual", "audio"]));
export type TrackKind = z.infer<typeof TrackKind>;

export const Track = named(
  "Track",
  z.strictObject({
    id: Id,
    name: z.string(),
    kind: TrackKind,
    muted: z.boolean(),
    locked: z.boolean(),
    hidden: z.boolean(),
    solo: z.boolean(),
    clips: z.array(Clip),
  }),
  "A track; shown as a layer in the photo UI and the Pro motion UI.",
);
export type Track = z.infer<typeof Track>;

export const Composition = named(
  "Composition",
  z.strictObject({
    id: Id,
    name: z.string(),
    width: z.int().min(1),
    height: z.int().min(1),
    fps: Rational,
    durationUs: TimeUs,
    background: Color,
    tracks: z.array(Track),
    markers: z.array(Marker),
  }),
  "A composition. tracks[0] is the bottom track; tracks composite bottom-to-top. " +
    "A photo is a composition with durationUs = 0, rendered at t = 0 only.",
);
export type Composition = z.infer<typeof Composition>;
