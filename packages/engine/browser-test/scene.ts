import type { Asset, Project } from "@lumacut/schema";
import { createProject } from "@lumacut/schema";
import { Engine, type EngineLimits, type MediaKind, type MediaResolver } from "../src/index.ts";
import { fixture, fixtureUrl } from "../src/testing/index.ts";

export type Rgba8 = readonly [number, number, number, number];

export interface TestImage {
  id: string;
  width: number;
  height: number;
  pixel: (x: number, y: number) => Rgba8;
}

export function solidImage(id: string, width: number, height: number, color: Rgba8): TestImage {
  return { id, width, height, pixel: () => color };
}

async function toBlobUrl(image: TestImage): Promise<string> {
  const canvas = new OffscreenCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("no 2d context");
  const data = ctx.createImageData(image.width, image.height);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1)
      data.data.set(image.pixel(x, y), (y * image.width + x) * 4);
  }
  ctx.putImageData(data, 0, 0);
  return URL.createObjectURL(await canvas.convertToBlob({ type: "image/png" }));
}

export function imageAsset(image: TestImage): Asset {
  return {
    id: image.id,
    kind: "image",
    name: image.id,
    mimeType: "image/png",
    sizeBytes: 1,
    source: "user",
    image: { width: image.width, height: image.height },
  };
}

/** A committed fixture as a project asset (what the library API would hand the engine). */
export function videoAsset(file: string): Asset {
  const f = fixture(file);
  return {
    id: file,
    kind: "video",
    name: file,
    mimeType: "video/mp4",
    sizeBytes: f.bytes,
    source: "user",
    video: {
      width: f.width,
      height: f.height,
      fps: f.fps,
      durationUs: Math.round((f.frames * 1_000_000 * f.fps.den) / f.fps.num),
      codec: "avc1",
    },
    ...(f.hasAudio
      ? {
          audio: {
            sampleRate: 48000,
            channels: 2,
            durationUs: Math.round((f.frames * 1_000_000 * f.fps.den) / f.fps.num),
            codec: "mp4a.40.2",
          },
        }
      : {}),
  };
}

/** Resolves test images to blob URLs and video fixtures to their served files. */
export class SceneResolver implements MediaResolver {
  readonly #urls = new Map<string, string>();
  readonly requests: { assetId: string; kind: MediaKind }[] = [];

  static async create(images: TestImage[]): Promise<SceneResolver> {
    const resolver = new SceneResolver();
    for (const image of images) resolver.#urls.set(image.id, await toBlobUrl(image));
    return resolver;
  }

  resolve(assetId: string, kind: MediaKind): Promise<string> {
    this.requests.push({ assetId, kind });
    const url = this.#urls.get(assetId);
    return Promise.resolve(url ?? fixtureUrl(assetId));
  }

  dispose(): void {
    for (const url of this.#urls.values()) URL.revokeObjectURL(url);
  }
}

export interface TestEngine {
  engine: Engine;
  canvas: OffscreenCanvas;
  resolver: SceneResolver;
  dispose: () => Promise<void>;
}

export async function createTestEngine(
  project: Project,
  images: TestImage[] = [],
  limits?: Partial<EngineLimits>,
): Promise<TestEngine> {
  const resolver = await SceneResolver.create(images);
  const canvas = new OffscreenCanvas(1, 1);
  const engine = Engine.create({ canvas, resolver, ...(limits ? { limits } : {}) });
  engine.setProject(project);
  return {
    engine,
    canvas,
    resolver,
    dispose: async () => {
      await engine.dispose();
      resolver.dispose();
    },
  };
}

export const NOW = "2026-11-02T00:00:00.000Z";

export function projectOf(
  assets: Asset[],
  compositions: Project["compositions"],
  mainCompositionId?: string,
): Project {
  return createProject({
    id: "p",
    now: NOW,
    assets,
    compositions,
    mainCompositionId: mainCompositionId ?? compositions[0]?.id ?? "main",
  });
}

/** sRGB transfer functions on 0..1 values: the oracle for colour expectations. */
export const srgbToLinear = (c: number): number =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
export const linearToSrgb = (c: number): number =>
  c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;

/** 8-bit sRGB value of a linear intensity. */
export const encode8 = (linear: number): number => Math.round(linearToSrgb(linear) * 255);

/** Unwraps a value that must exist, failing the test with a clear message otherwise. */
export function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`Expected ${what}`);
  return value;
}

/** `list[index]`, failing clearly instead of returning undefined (noUncheckedIndexedAccess). */
export function at<T>(list: readonly T[], index: number): T {
  return must(list[index], `an item at index ${String(index)}`);
}
