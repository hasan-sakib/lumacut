import type { EngineStats } from "../stats.ts";
import { required } from "./util.ts";

export interface CachedTexture {
  key: string;
  texture: WebGLTexture;
  width: number;
  height: number;
  bytes: number;
  /** Size + format class: only textures of the same class are recycled into each other. */
  poolKey: string;
}

const DEFAULT_BYTES_PER_PIXEL = 4; // RGBA8; nested compositions pass 8 (RGBA16F)
/** Freed textures kept for reuse (allocation is the slow part of a texture upload). */
const POOL_LIMIT_BYTES = 64 * 1024 * 1024;

/** Receives a texture to fill; `reused` is true when it already has storage of this size. */
export type TextureFill = (texture: WebGLTexture, reused: boolean) => void;

/**
 * GPU texture cache: least-recently-used eviction under a byte budget, a pool that recycles
 * same-sized textures, and pinning for textures the frame being rendered still needs. Decoded
 * video frames and rendered nested compositions both live here.
 */
export class TextureCache {
  readonly #gl: WebGL2RenderingContext;
  readonly #budgetBytes: number;
  readonly #stats: EngineStats;
  /** Insertion order is recency: the first entry is the least recently used. */
  readonly #entries = new Map<string, CachedTexture>();
  readonly #pool = new Map<string, { texture: WebGLTexture; bytes: number }[]>();
  readonly #pinned = new Set<string>();
  #pooledBytes = 0;

  constructor(gl: WebGL2RenderingContext, budgetBytes: number, stats: EngineStats) {
    this.#gl = gl;
    this.#budgetBytes = budgetBytes;
    this.#stats = stats;
  }

  has(key: string): boolean {
    return this.#entries.has(key);
  }

  /** Cached texture for `key` (marks it most recently used), or undefined. */
  get(key: string): CachedTexture | undefined {
    const entry = this.#entries.get(key);
    if (entry === undefined) return undefined;
    this.#entries.delete(key);
    this.#entries.set(key, entry);
    this.#stats.textureHits += 1;
    return entry;
  }

  /** Allocates (or recycles) a texture for `key`, lets `fill` write it, then evicts to fit. */
  put(
    key: string,
    width: number,
    height: number,
    fill: TextureFill,
    bytesPerPixel = DEFAULT_BYTES_PER_PIXEL,
  ): CachedTexture {
    const existing = this.#entries.get(key);
    if (existing !== undefined) this.#remove(key, existing);
    const poolKey = `${String(width)}x${String(height)}@${String(bytesPerPixel)}`;
    const recycled = this.#takeFromPool(poolKey);
    const texture = recycled ?? this.#create();
    fill(texture, recycled !== undefined);
    const entry: CachedTexture = {
      key,
      texture,
      width,
      height,
      bytes: width * height * bytesPerPixel,
      poolKey,
    };
    this.#entries.set(key, entry);
    this.#stats.textureMisses += 1;
    this.#stats.textureCount += 1;
    this.#stats.textureBytes += entry.bytes;
    this.#evictToBudget(key);
    return entry;
  }

  pin(key: string): void {
    this.#pinned.add(key);
  }

  /** Call once a frame is rendered: everything becomes evictable again. */
  unpinAll(): void {
    this.#pinned.clear();
    this.#evictToBudget(null);
  }

  get bytes(): number {
    return this.#stats.textureBytes;
  }

  get budgetBytes(): number {
    return this.#budgetBytes;
  }

  get size(): number {
    return this.#entries.size;
  }

  /** Drops entries whose key starts with `prefix` (e.g. every frame of a replaced asset). */
  evictPrefix(prefix: string): void {
    for (const [key, entry] of [...this.#entries]) {
      if (key.startsWith(prefix)) this.#remove(key, entry);
    }
  }

  dispose(): void {
    for (const [key, entry] of [...this.#entries]) this.#remove(key, entry, false);
    for (const list of this.#pool.values()) {
      for (const pooled of list) this.#gl.deleteTexture(pooled.texture);
    }
    this.#pool.clear();
    this.#pooledBytes = 0;
    this.#stats.pooledTextureCount = 0;
    this.#stats.pooledTextureBytes = 0;
    this.#pinned.clear();
  }

  #create(): WebGLTexture {
    const gl = this.#gl;
    const texture = required(gl.createTexture(), "texture");
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  }

  #takeFromPool(poolKey: string): WebGLTexture | undefined {
    const pooled = this.#pool.get(poolKey)?.pop();
    if (pooled === undefined) return undefined;
    this.#pooledBytes -= pooled.bytes;
    this.#syncPoolStats();
    return pooled.texture;
  }

  #remove(key: string, entry: CachedTexture, recycle = true): void {
    this.#entries.delete(key);
    this.#pinned.delete(key);
    this.#stats.textureCount -= 1;
    this.#stats.textureBytes -= entry.bytes;
    if (recycle && this.#pooledBytes + entry.bytes <= POOL_LIMIT_BYTES) {
      const list = this.#pool.get(entry.poolKey) ?? [];
      list.push({ texture: entry.texture, bytes: entry.bytes });
      this.#pool.set(entry.poolKey, list);
      this.#pooledBytes += entry.bytes;
      this.#syncPoolStats();
    } else {
      this.#gl.deleteTexture(entry.texture);
    }
  }

  #syncPoolStats(): void {
    let count = 0;
    for (const list of this.#pool.values()) count += list.length;
    this.#stats.pooledTextureCount = count;
    this.#stats.pooledTextureBytes = this.#pooledBytes;
  }

  #evictToBudget(keep: string | null): void {
    for (const [key, entry] of this.#entries) {
      if (this.#stats.textureBytes <= this.#budgetBytes) return;
      if (key === keep || this.#pinned.has(key)) continue;
      this.#remove(key, entry);
      this.#stats.textureEvictions += 1;
    }
  }
}
