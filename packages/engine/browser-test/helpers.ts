import {
  EngineStats,
  MediaRegistry,
  TextureCache,
  createGl,
  uploadSource,
  type MediaResolver,
  type TrackedFrame,
} from "../src/index.ts";
import { required } from "../src/gl/util.ts";
import { fixtureUrl, readTextureBarcode, type FixtureEntry } from "../src/testing/index.ts";

/** Maps an asset id to the committed fixture of the same name (same-origin, range-capable). */
export const fixtureResolver: MediaResolver = {
  resolve: (assetId) => Promise.resolve(fixtureUrl(assetId)),
};

export interface GlHarness {
  canvas: OffscreenCanvas;
  gl: WebGL2RenderingContext;
  stats: EngineStats;
  registry: MediaRegistry;
  cache: TextureCache;
  dispose: () => Promise<void>;
}

export function makeHarness(
  options: { budgetBytes?: number; resolver?: MediaResolver } = {},
): GlHarness {
  const canvas = new OffscreenCanvas(64, 64);
  const { gl } = createGl(canvas);
  const stats = new EngineStats();
  const registry = new MediaRegistry(options.resolver ?? fixtureResolver);
  const cache = new TextureCache(gl, options.budgetBytes ?? 64 * 1024 * 1024, stats);
  return {
    canvas,
    gl,
    stats,
    registry,
    cache,
    dispose: async () => {
      await registry.dispose();
      cache.dispose();
    },
  };
}

/** Uploads a decoded frame to a scratch texture and reads the barcode it shows. */
export function barcodeOfFrame(gl: WebGL2RenderingContext, frame: TrackedFrame): number | null {
  const texture = required(gl.createTexture(), "texture");
  try {
    frame.withVideoFrame((videoFrame) => {
      uploadSource(gl, texture, videoFrame, false);
    });
    return readTextureBarcode(gl, texture, frame.width, frame.height);
  } finally {
    gl.deleteTexture(texture);
  }
}

/** Small seeded PRNG so "random" orders are reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled(count: number, seed: number): number[] {
  const order = Array.from({ length: count }, (_, i) => i);
  const random = mulberry32(seed);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const a = order[i];
    const b = order[j];
    if (a === undefined || b === undefined) continue;
    order[i] = b;
    order[j] = a;
  }
  return order;
}

export type { FixtureEntry };
