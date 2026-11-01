import * as z from "zod";
import { Id, Origin, Rational, TimeUs } from "./primitives.ts";
import { named } from "./registry.ts";

export const AssetKind = named("AssetKind", z.enum(["video", "audio", "image", "lut", "font"]));
export type AssetKind = z.infer<typeof AssetKind>;

export const VideoStreamInfo = named(
  "VideoStreamInfo",
  z.strictObject({
    width: z.int().min(1),
    height: z.int().min(1),
    fps: Rational,
    durationUs: TimeUs,
    codec: z.string().min(1),
  }),
);
export type VideoStreamInfo = z.infer<typeof VideoStreamInfo>;

export const AudioStreamInfo = named(
  "AudioStreamInfo",
  z.strictObject({
    sampleRate: z.int().min(1),
    channels: z.int().min(1),
    durationUs: TimeUs,
    codec: z.string().min(1),
  }),
);
export type AudioStreamInfo = z.infer<typeof AudioStreamInfo>;

export const ImageInfo = named(
  "ImageInfo",
  z.strictObject({
    width: z.int().min(1),
    height: z.int().min(1),
  }),
);
export type ImageInfo = z.infer<typeof ImageInfo>;

export const Asset = named(
  "Asset",
  z.strictObject({
    id: Id,
    kind: AssetKind,
    name: z.string(),
    mimeType: z.string().min(1),
    sizeBytes: z.int().min(0),
    source: Origin,
    aiRunId: Id.optional(),
    video: VideoStreamInfo.optional(),
    audio: AudioStreamInfo.optional(),
    image: ImageInfo.optional(),
  }),
  "Reference to a stored media file. Storage locations, proxies and processing status live in " +
    "the backend asset record, resolved by id; the document keeps only what editing needs.",
);
export type Asset = z.infer<typeof Asset>;
