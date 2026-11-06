import { afterEach, describe, expect, it, vi } from "vitest";
import { MediaError, TextureCache, loadImageBitmap, uploadSource } from "../src/index.ts";
import { pixelAt, readTexturePixels } from "../src/testing/index.ts";
import { makeHarness, type GlHarness } from "./helpers.ts";

let harness: GlHarness | null = null;

afterEach(async () => {
  await harness?.dispose();
  harness = null;
});

const SIZE = 100;
const BYTES = SIZE * SIZE * 4;

function solid(color: string, size = SIZE): OffscreenCanvas {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("no 2d context");
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

function put(
  cache: TextureCache,
  gl: WebGL2RenderingContext,
  key: string,
  color = "#f00",
  size = SIZE,
) {
  return cache.put(key, size, size, (texture, reused) => {
    uploadSource(gl, texture, solid(color, size), reused);
  });
}

function setup(textures: number): { cache: TextureCache; h: GlHarness } {
  harness = makeHarness({ budgetBytes: BYTES * textures });
  return { cache: harness.cache, h: harness };
}

describe("TextureCache", () => {
  it("stores textures and counts hits, misses and bytes", () => {
    const { cache, h } = setup(4);
    put(cache, h.gl, "a");
    put(cache, h.gl, "b");
    expect(cache.get("a")?.bytes).toBe(BYTES);
    expect(cache.get("missing")).toBeUndefined();
    expect(cache.has("b")).toBe(true);
    expect(h.stats.snapshot()).toMatchObject({
      textureCount: 2,
      textureBytes: 2 * BYTES,
      textureMisses: 2,
      textureHits: 1,
    });
  });

  it("evicts the least recently used texture when over budget", () => {
    const { cache, h } = setup(3);
    for (const key of ["k1", "k2", "k3"]) put(cache, h.gl, key);
    cache.get("k1"); // k1 is now the most recently used, so k2 is the oldest
    put(cache, h.gl, "k4");
    expect(cache.has("k2")).toBe(false);
    expect(["k1", "k3", "k4"].every((k) => cache.has(k))).toBe(true);
    expect(h.stats.textureEvictions).toBe(1);
    expect(cache.bytes).toBeLessThanOrEqual(cache.budgetBytes);
  });

  it("never evicts pinned textures, then catches up once they are released", () => {
    const { cache, h } = setup(3);
    for (const key of ["a", "b", "c"]) {
      put(cache, h.gl, key);
      cache.pin(key);
    }
    put(cache, h.gl, "d"); // over budget, but a, b, c are in use by the current frame
    expect(cache.size).toBe(4);
    expect(cache.bytes).toBeGreaterThan(cache.budgetBytes);
    cache.unpinAll();
    expect(cache.size).toBe(3);
    expect(cache.bytes).toBeLessThanOrEqual(cache.budgetBytes);
    expect(cache.has("d")).toBe(true); // the newest survives
  });

  it("recycles evicted textures of the same size, and writes fresh content into them", () => {
    const { cache, h } = setup(1);
    const first = put(cache, h.gl, "red", "#ff0000");
    const firstTexture = first.texture;
    const fills: boolean[] = [];
    const second = cache.put("green", SIZE, SIZE, (texture, reused) => {
      fills.push(reused);
      uploadSource(h.gl, texture, solid("#00ff00"), reused);
    });
    expect(fills).toEqual([false]); // red was still cached while green was filled
    expect(cache.has("red")).toBe(false); // ...and evicted right after
    const third = cache.put("blue", SIZE, SIZE, (texture, reused) => {
      fills.push(reused);
      uploadSource(h.gl, texture, solid("#0000ff"), reused);
    });
    expect(fills).toEqual([false, true]);
    expect(third.texture).toBe(firstTexture); // red's texture came back as blue
    const pixels = readTexturePixels(h.gl, third.texture, SIZE, SIZE);
    expect(pixelAt(pixels, SIZE, 50, 50)).toEqual([0, 0, 255, 255]);
    expect(second.texture).not.toBe(third.texture);
  });

  it("allocates new storage when sizes differ", () => {
    const { cache, h } = setup(1);
    put(cache, h.gl, "small", "#f00", 50);
    const reuse = vi.fn();
    cache.put("big", SIZE, SIZE, (texture, reused) => {
      reuse(reused);
      uploadSource(h.gl, texture, solid("#0f0"), reused);
    });
    expect(reuse).toHaveBeenCalledWith(false);
  });

  it("replacing a key does not double count", () => {
    const { cache, h } = setup(4);
    put(cache, h.gl, "a");
    put(cache, h.gl, "a", "#0f0");
    expect(h.stats.snapshot()).toMatchObject({ textureCount: 1, textureBytes: BYTES });
  });

  it("evicts by key prefix", () => {
    const { cache, h } = setup(8);
    for (const key of ["asset1:0", "asset1:1", "asset2:0"]) put(cache, h.gl, key);
    cache.evictPrefix("asset1:");
    expect(cache.size).toBe(1);
    expect(cache.has("asset2:0")).toBe(true);
  });

  it("deletes every GPU texture on dispose, including pooled ones", () => {
    const { cache, h } = setup(1);
    const a = put(cache, h.gl, "a");
    const b = put(cache, h.gl, "b"); // evicts a into the pool
    cache.dispose();
    expect(h.gl.isTexture(a.texture)).toBe(false);
    expect(h.gl.isTexture(b.texture)).toBe(false);
    expect(h.stats.snapshot()).toMatchObject({
      textureCount: 0,
      textureBytes: 0,
      pooledTextureCount: 0,
      pooledTextureBytes: 0,
    });
  });
});

describe("loadImageBitmap", () => {
  it("decodes to premultiplied alpha, ready to upload", async () => {
    harness = makeHarness();
    const canvas = new OffscreenCanvas(8, 8);
    const ctx = canvas.getContext("2d");
    if (ctx === null) throw new Error("no 2d context");
    ctx.fillStyle = "rgba(255, 0, 0, 0.5)";
    ctx.fillRect(0, 0, 8, 8);
    const url = URL.createObjectURL(await canvas.convertToBlob({ type: "image/png" }));
    const bitmap = await loadImageBitmap("img", url);
    const { gl, cache } = harness;
    const entry = cache.put("img", 8, 8, (texture, reused) => {
      uploadSource(gl, texture, bitmap, reused);
    });
    bitmap.close();
    const [r, g, b, a] = pixelAt(readTexturePixels(gl, entry.texture, 8, 8), 8, 3, 3);
    expect(a).toBeGreaterThanOrEqual(127);
    expect(a).toBeLessThanOrEqual(129);
    expect(r).toBeGreaterThanOrEqual(126); // 255 * 0.5, premultiplied
    expect(r).toBeLessThanOrEqual(129);
    expect([g, b]).toEqual([0, 0]);
    URL.revokeObjectURL(url);
  });

  it("explains download and decode failures", async () => {
    await expect(loadImageBitmap("img1", "/not-an-image.png")).rejects.toBeInstanceOf(MediaError);
    const bad = URL.createObjectURL(new Blob(["not an image"], { type: "image/png" }));
    await expect(loadImageBitmap("img2", bad)).rejects.toThrow(/Asset img2: couldn't decode/);
    URL.revokeObjectURL(bad);
  });
});
