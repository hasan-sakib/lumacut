import type { Asset, Clip, Composition, Project } from "@lumacut/schema";
import { performanceClock, type Clock } from "../clock.ts";
import { loadImageBitmap } from "../decode/image-source.ts";
import type { MediaResolver } from "../decode/media.ts";
import { MediaError } from "../decode/media.ts";
import { MediaRegistry } from "../decode/media-registry.ts";
import { Compositor, type LayerDraw } from "../gl/compositor.ts";
import { createGl, type GlCaps } from "../gl/context.ts";
import type { Target } from "../gl/targets.ts";
import { TextureCache, type CachedTexture } from "../gl/texture-cache.ts";
import { uploadSource } from "../gl/upload.ts";
import { croppedRect, layerMatrix } from "../math/matrix.ts";
import { DEFAULT_LIMITS, EngineStats, type EngineLimits, type StatsSnapshot } from "../stats.ts";
import { activeVisualClips } from "../timeline/active.ts";
import { sourceFrameIndex, sourceInstantUs } from "../timeline/source-time.ts";
import { DiagnosticSink, type Diagnostic } from "./diagnostics.ts";
import { compositionHash } from "./hash.ts";
import { reportIgnoredFeatures, resolveClipProps } from "./properties.ts";
import { ReaderPool } from "./reader-pool.ts";
import { validateProject } from "./validate.ts";

export interface EngineOptions {
  canvas: OffscreenCanvas | HTMLCanvasElement;
  resolver: MediaResolver;
  limits?: Partial<EngineLimits>;
  clock?: Clock;
}

export interface RenderOptions {
  /** Also return the rendered pixels (tests and the render page; costs a GPU readback). */
  readback?: boolean;
}

/** The result of a render that asked for `readback: true`. */
export type ReadbackRenderResult = RenderResult & { pixels: Uint8Array };

export interface RenderResult {
  compositionId: string;
  tUs: number;
  width: number;
  height: number;
  diagnostics: Diagnostic[];
  renderMs: number;
  /** Premultiplied RGBA8, top-left origin (what the canvas shows). Only with `readback`. */
  pixels?: Uint8Array;
}

interface LayerSource {
  texture: WebGLTexture;
  width: number;
  height: number;
  sourceKind: 0 | 1;
  flipV: boolean;
}

interface RenderContext {
  diagnostics: DiagnosticSink;
  /** Texture-cache keys the current frame is using; they must not be evicted mid-frame. */
  usedClips: Set<string>;
}

/**
 * Deterministic renderer: `renderAt(compositionId, tUs)` draws that instant of a composition onto
 * the canvas. Output depends only on the project, the time and the media, never on what was
 * rendered before (seek history, cache contents) or on the clock.
 */
export class Engine {
  readonly stats = new EngineStats();
  readonly caps: GlCaps;
  readonly #canvas: OffscreenCanvas | HTMLCanvasElement;
  readonly #gl: WebGL2RenderingContext;
  readonly #clock: Clock;
  readonly #resolver: MediaResolver;
  readonly #registry: MediaRegistry;
  readonly #cache: TextureCache;
  readonly #readers: ReaderPool;
  readonly #compositor: Compositor;
  readonly #inflight = new Map<string, Promise<CachedTexture>>();
  readonly #scratchFramebuffer: WebGLFramebuffer;
  #project: Project | null = null;
  #assets = new Map<string, Asset>();
  #hashMemo = new Map<string, string>();
  #queue: Promise<unknown> = Promise.resolve();
  #disposed = false;

  private constructor(options: EngineOptions) {
    const limits = { ...DEFAULT_LIMITS, ...options.limits };
    this.#canvas = options.canvas;
    this.#clock = options.clock ?? performanceClock;
    this.#resolver = options.resolver;
    const { gl, caps } = createGl(options.canvas);
    this.#gl = gl;
    this.caps = caps;
    this.#registry = new MediaRegistry(options.resolver);
    this.#cache = new TextureCache(gl, limits.textureBudgetBytes, this.stats);
    this.#readers = new ReaderPool(limits.maxReaders, this.stats);
    this.#compositor = new Compositor(gl, this.stats);
    this.#scratchFramebuffer = gl.createFramebuffer();
  }

  static create(options: EngineOptions): Engine {
    return new Engine(options);
  }

  /** Replaces the project. Throws (leaving the old project in place) if compositions form a cycle. */
  setProject(project: Project): void {
    validateProject(project);
    this.#project = project;
    this.#assets = new Map(project.assets.map((a) => [a.id, a]));
    this.#hashMemo = new Map();
  }

  /** Renders one instant. Calls are queued and run one at a time. */
  renderAt(
    compositionId: string,
    tUs: number,
    options: RenderOptions & { readback: true },
  ): Promise<ReadbackRenderResult>;
  renderAt(compositionId: string, tUs: number, options?: RenderOptions): Promise<RenderResult>;
  renderAt(compositionId: string, tUs: number, options: RenderOptions = {}): Promise<RenderResult> {
    const run = this.#queue.then(() => this.#render(compositionId, tUs, options));
    this.#queue = run.catch(() => undefined);
    return run;
  }

  snapshot(): StatsSnapshot {
    return this.stats.snapshot();
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    await this.#queue;
    await this.#readers.dispose();
    await this.#registry.dispose();
    this.#cache.dispose();
    this.#compositor.dispose();
    this.#gl.deleteFramebuffer(this.#scratchFramebuffer);
    // Browsers allow only ~16 live WebGL contexts: give this one back now, not at garbage collection.
    this.#gl.getExtension("WEBGL_lose_context")?.loseContext();
  }

  async #render(compositionId: string, tUs: number, options: RenderOptions): Promise<RenderResult> {
    if (this.#disposed) throw new Error("The engine was disposed");
    const project = this.#project;
    if (project === null) throw new Error("No project loaded: call setProject() first");
    const composition = project.compositions.find((c) => c.id === compositionId);
    if (composition === undefined) throw new Error(`Unknown composition "${compositionId}"`);

    const started = this.#clock.nowMs();
    const context: RenderContext = { diagnostics: new DiagnosticSink(), usedClips: new Set() };
    if (this.#canvas.width !== composition.width) this.#canvas.width = composition.width;
    if (this.#canvas.height !== composition.height) this.#canvas.height = composition.height;

    const target = await this.#renderComposition(context, composition, tUs);
    this.#compositor.present(target);
    const pixels = options.readback
      ? this.#readCanvas(composition.width, composition.height)
      : undefined;

    this.#compositor.pool.release(target);
    this.#cache.unpinAll();
    await this.#readers.trim(context.usedClips);
    this.stats.rendersCompleted += 1;
    return {
      compositionId,
      tUs,
      width: composition.width,
      height: composition.height,
      diagnostics: context.diagnostics.list(),
      renderMs: this.#clock.nowMs() - started,
      ...(pixels === undefined ? {} : { pixels }),
    };
  }

  /** Draws a composition into a pooled target; the caller releases it. */
  async #renderComposition(
    context: RenderContext,
    composition: Composition,
    tUs: number,
  ): Promise<Target> {
    const active = activeVisualClips(composition, tUs);
    const sources = await Promise.all(
      active.map((entry) => this.#resolveLayer(context, entry.clip, tUs)),
    );

    let accum = this.#compositor.pool.acquire(composition.width, composition.height);
    let scratch = this.#compositor.pool.acquire(composition.width, composition.height);
    this.#compositor.clear(accum, composition.background);
    active.forEach((entry, i) => {
      const source = sources[i];
      if (source === null || source === undefined) return;
      const props = resolveClipProps(entry.clip, tUs);
      const draw: LayerDraw = {
        texture: source.texture,
        sourceKind: source.sourceKind,
        flipV: source.flipV,
        layerWidth: source.width,
        layerHeight: source.height,
        rect: croppedRect(source.width, source.height, props.crop),
        matrix: layerMatrix(props.transform),
        opacity: props.opacity,
        blendMode: props.blendMode,
      };
      ({ accum, scratch } = this.#compositor.drawLayer(accum, scratch, draw));
    });
    this.#compositor.pool.release(scratch);
    return accum;
  }

  async #resolveLayer(
    context: RenderContext,
    clip: Clip,
    tUs: number,
  ): Promise<LayerSource | null> {
    reportIgnoredFeatures(clip, context.diagnostics);
    try {
      if (clip.type === "media") return await this.#resolveMedia(context, clip, tUs);
      if (clip.type === "composition") return await this.#resolveNested(context, clip, tUs);
      context.diagnostics.add({
        clipId: clip.id,
        level: "warning",
        code: "unsupported_clip_type",
        message: `${clip.type} clips aren't drawn yet.`,
      });
      return null;
    } catch (error) {
      context.diagnostics.add({
        clipId: clip.id,
        level: "error",
        code: error instanceof MediaError ? "media_error" : "render_error",
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async #resolveMedia(
    context: RenderContext,
    clip: Clip,
    tUs: number,
  ): Promise<LayerSource | null> {
    const fail = (code: string, message: string): null => {
      context.diagnostics.add({ clipId: clip.id, level: "error", code, message });
      return null;
    };
    if (clip.assetId === undefined) return fail("missing_asset", "The clip has no asset.");
    const asset = this.#assets.get(clip.assetId);
    if (asset === undefined)
      return fail("missing_asset", `Asset ${clip.assetId} isn't in the project.`);
    context.usedClips.add(clip.id);

    if (asset.kind === "image") {
      const entry = await this.#shared(`i:${asset.id}`, async () => {
        const bitmap = await loadImageBitmap(
          asset.id,
          await this.#resolver.resolve(asset.id, "image"),
        );
        try {
          if (Math.max(bitmap.width, bitmap.height) > this.caps.maxTextureSize) {
            throw new MediaError(
              asset.id,
              `the image is ${String(bitmap.width)}×${String(bitmap.height)}, larger than this GPU's ` +
                `${String(this.caps.maxTextureSize)} px texture limit`,
            );
          }
          return this.#cache.put(
            `i:${asset.id}`,
            bitmap.width,
            bitmap.height,
            (texture, reused) => {
              uploadSource(this.#gl, texture, bitmap, reused);
            },
          );
        } finally {
          bitmap.close();
        }
      });
      return this.#asLayer(entry, asset.image);
    }

    if (asset.kind !== "video" || asset.video === undefined) {
      return fail(
        "wrong_asset_kind",
        `Asset ${asset.id} is ${asset.kind} and can't be drawn as a layer.`,
      );
    }
    const fps = asset.video.fps;
    const frame = sourceFrameIndex(clip, tUs, fps);
    const key = `v:${asset.id}:${String(frame)}`;
    const entry = await this.#shared(key, async () => {
      const media = await this.#registry.video(asset.id);
      const reader = this.#readers.acquire(clip.id, media, fps);
      const decoded = await reader.frame(frame);
      try {
        return this.#cache.put(key, decoded.width, decoded.height, (texture, reused) => {
          decoded.withVideoFrame((videoFrame) => {
            uploadSource(this.#gl, texture, videoFrame, reused);
          });
        });
      } finally {
        decoded.close();
      }
    });
    return this.#asLayer(entry, asset.video);
  }

  async #resolveNested(
    context: RenderContext,
    clip: Clip,
    tUs: number,
  ): Promise<LayerSource | null> {
    const project = this.#project;
    const child = project?.compositions.find((c) => c.id === clip.compositionId);
    if (project === null || child === undefined) {
      context.diagnostics.add({
        clipId: clip.id,
        level: "error",
        code: "composition_missing",
        message: `Composition ${String(clip.compositionId)} isn't in the project.`,
      });
      return null;
    }
    const childTime = sourceInstantUs(clip, tUs);
    const hash = compositionHash(project, child, this.#hashMemo);
    const key = `n:${child.id}:${hash}:${String(childTime)}`;
    const entry = await this.#shared(key, async () => {
      this.stats.nestedRenders += 1;
      const rendered = await this.#renderComposition(context, child, childTime);
      try {
        const result = this.#cache.put(
          key,
          child.width,
          child.height,
          (texture, reused) => {
            if (!reused) this.#allocate16F(texture, child.width, child.height);
            this.#copyInto(rendered, texture);
          },
          8, // RGBA16F
        );
        return result;
      } finally {
        this.#compositor.pool.release(rendered);
      }
    });
    return { ...this.#asLayer(entry), sourceKind: 1, flipV: true };
  }

  /** Runs `produce` once per key even when several clips want the same texture in one frame. */
  async #shared(key: string, produce: () => Promise<CachedTexture>): Promise<CachedTexture> {
    const cached = this.#cache.get(key);
    if (cached !== undefined) {
      this.#cache.pin(key);
      return cached;
    }
    let pending = this.#inflight.get(key);
    if (pending === undefined) {
      pending = produce().finally(() => {
        this.#inflight.delete(key);
      });
      this.#inflight.set(key, pending);
    }
    const entry = await pending;
    this.#cache.pin(key);
    return entry;
  }

  /**
   * `declared` is the asset's size as probed from the original upload. Transforms are authored
   * against it, while the texture is whatever rendition was decoded (a proxy of up to 720p, or a
   * downscaled image): the layer takes the declared size and the texture is stretched to fit.
   */
  #asLayer(entry: CachedTexture, declared?: { width: number; height: number }): LayerSource {
    return {
      texture: entry.texture,
      width: declared?.width ?? entry.width,
      height: declared?.height ?? entry.height,
      sourceKind: 0,
      flipV: false,
    };
  }

  /** A fresh cache texture has no storage yet; give it immutable RGBA16F storage. */
  #allocate16F(texture: WebGLTexture, width: number, height: number): void {
    const gl = this.#gl;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, width, height);
  }

  #copyInto(source: Target, texture: WebGLTexture): void {
    const gl = this.#gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.#scratchFramebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    this.#compositor.copy(source, this.#scratchFramebuffer);
  }

  #readCanvas(width: number, height: number): Uint8Array {
    const gl = this.#gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const bottomUp = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, bottomUp);
    const rowBytes = width * 4;
    const topDown = new Uint8Array(bottomUp.length);
    for (let y = 0; y < height; y += 1) {
      topDown.set(bottomUp.subarray(y * rowBytes, (y + 1) * rowBytes), (height - 1 - y) * rowBytes);
    }
    return topDown;
  }
}
