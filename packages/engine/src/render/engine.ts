import type { Asset, Clip, Composition, Project } from "@lumacut/schema";
import { performanceClock, type Clock } from "../clock.ts";
import { loadImageBitmap } from "../decode/image-source.ts";
import type { MediaResolver } from "../decode/media.ts";
import { MediaError } from "../decode/media.ts";
import { MediaRegistry } from "../decode/media-registry.ts";
import { Compositor, type LayerDraw } from "../gl/compositor.ts";
import type { ScopeSample } from "../scopes/compute.ts";
import { createGl, type GlCaps } from "../gl/context.ts";
import type { Target } from "../gl/targets.ts";
import { TextureCache, type CachedTexture } from "../gl/texture-cache.ts";
import { uploadSource } from "../gl/upload.ts";
import { IDENTITY, croppedRect, layerMatrix } from "../math/matrix.ts";
import { DEFAULT_LIMITS, EngineStats, type EngineLimits, type StatsSnapshot } from "../stats.ts";
import { frameIndexOf } from "../timeline/frames.ts";
import { planLayers, type LayerPlanItem } from "../timeline/transitions.ts";
import {
  extendedSourceFrameIndex,
  extendedSourceInstantUs,
  isClipActive,
  sourceFrameIndex,
  sourceInstantUs,
} from "../timeline/source-time.ts";
import { DiagnosticSink, type Diagnostic } from "./diagnostics.ts";
import { compositionHash } from "./hash.ts";
import { Params, transitionById } from "@lumacut/effects";
import { captionTextAt } from "../text/caption.ts";
import { FontLoader } from "../text/fonts.ts";
import { renderText } from "../text/render-text.ts";
import { LayerFx } from "./layer-fx.ts";
import { reportIgnoredFeatures, resolveClipProps, type ResolvedLayerProps } from "./properties.ts";
import { ReaderPool } from "./reader-pool.ts";
import { validateProject } from "./validate.ts";

export interface EngineOptions {
  canvas: OffscreenCanvas | HTMLCanvasElement;
  resolver: MediaResolver;
  /** Where the bundled font files are served from (absolute URL ending in "/"). Default `/fonts/`. */
  fontBaseUrl?: string;
  limits?: Partial<EngineLimits>;
  clock?: Clock;
}

export interface RenderOptions {
  /** Also return the rendered pixels (tests and the render page; costs a GPU readback). */
  readback?: boolean;
  /** Also return the picture downscaled to this width (for the video scopes; a small readback). */
  scopeWidth?: number;
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
  /** The picture downscaled for the scopes. Only with `scopeWidth`. */
  scope?: ScopeSample;
}

interface LayerSource {
  texture: WebGLTexture;
  width: number;
  height: number;
  sourceKind: 0 | 1;
  flipV: boolean;
  /** Text: the transform's anchor is measured from the centre of the picture, so 0,0 centres it. */
  anchorCenter?: boolean;
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
  readonly #fx: LayerFx;
  readonly #fonts: FontLoader;
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
    this.#fx = new LayerFx(
      gl,
      this.stats,
      this.#compositor.pool,
      options.resolver,
      caps.maxTextureSize,
    );
    this.#fonts = new FontLoader(options.fontBaseUrl ?? "/fonts/");
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
    this.#fx.dispose();
    this.#compositor.dispose();
    this.#gl.deleteFramebuffer(this.#scratchFramebuffer);
    if (this.#scopeTarget !== null) {
      this.#gl.deleteFramebuffer(this.#scopeTarget.fb);
      this.#gl.deleteRenderbuffer(this.#scopeTarget.rb);
    }
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

    const scope =
      options.scopeWidth === undefined
        ? undefined
        : this.#readScope(composition.width, composition.height, options.scopeWidth);

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
      ...(scope === undefined ? {} : { scope }),
    };
  }

  /** Draws a composition into a pooled target; the caller releases it. */
  async #renderComposition(
    context: RenderContext,
    composition: Composition,
    tUs: number,
  ): Promise<Target> {
    const plan = planLayers(composition, tUs);
    for (const id of plan.orphanTransitions) {
      context.diagnostics.add({
        clipId: id,
        level: "warning",
        code: "transition_without_neighbour",
        message:
          "This clip has a transition but the clip before it no longer ends where it starts, so it is a plain cut.",
      });
    }
    const resolved = await Promise.all(
      plan.items.map(async (item) => {
        if (item.type === "clip") {
          await this.#prepareColour(context, item.clip);
          return { source: await this.#resolveLayer(context, item.clip, tUs, composition) };
        }
        await Promise.all([
          this.#prepareColour(context, item.from),
          this.#prepareColour(context, item.to),
        ]);
        const [a, b] = await Promise.all([
          this.#resolveLayer(context, item.from, tUs, composition, true),
          this.#resolveLayer(context, item.to, tUs, composition, true),
        ]);
        return { a, b };
      }),
    );

    let accum = this.#compositor.pool.acquire(composition.width, composition.height);
    let scratch = this.#compositor.pool.acquire(composition.width, composition.height);
    this.#compositor.clear(accum, composition.background);
    const frame = frameIndexOf(composition, tUs);
    plan.items.forEach((item, i) => {
      const entry = resolved[i];
      if (entry === undefined) return;
      if (item.type === "transition") {
        ({ accum, scratch } = this.#drawTransition(
          context,
          accum,
          scratch,
          item,
          entry.a ?? null,
          entry.b ?? null,
          tUs,
          composition,
          frame,
        ));
        return;
      }
      if (item.clip.type === "adjustment") {
        ({ accum, scratch } = this.#drawAdjustment(
          context,
          accum,
          scratch,
          item.clip,
          resolveClipProps(item.clip, tUs),
          frame,
        ));
        return;
      }
      if (entry.source === null || entry.source === undefined) return;
      ({ accum, scratch } = this.#drawClip(
        context,
        accum,
        scratch,
        item.clip,
        entry.source,
        tUs,
        frame,
      ));
    });
    this.#compositor.pool.release(scratch);
    return accum;
  }

  /** Draws one clip (crop, colour, effects, transform, opacity, blend) over `accum`. */
  #drawClip(
    context: RenderContext,
    accum: Target,
    scratch: Target,
    clip: Clip,
    source: LayerSource,
    tUs: number,
    frame: number,
    blendOverride?: LayerDraw["blendMode"],
  ): { accum: Target; scratch: Target } {
    const props = resolveClipProps(clip, tUs);
    const transform =
      source.anchorCenter === true
        ? {
            ...props.transform,
            anchorX: props.transform.anchorX + source.width / 2,
            anchorY: props.transform.anchorY + source.height / 2,
          }
        : props.transform;
    const matrix = layerMatrix(transform);
    let draw: LayerDraw = {
      texture: source.texture,
      sourceKind: source.sourceKind,
      flipV: source.flipV,
      layerWidth: source.width,
      layerHeight: source.height,
      rect: croppedRect(source.width, source.height, props.crop),
      matrix,
      opacity: props.opacity,
      blendMode: blendOverride ?? props.blendMode,
    };
    let processed: Target | null = null;
    if (this.#fx.needs(props.clip)) {
      const result = this.#fx.process(source, props, matrix, frame, (code, message) => {
        context.diagnostics.add({ clipId: clip.id, level: "warning", code, message });
      });
      if ("error" in result) {
        if (result.error !== "empty") {
          context.diagnostics.add({
            clipId: clip.id,
            level: "error",
            code: "render_error",
            message: result.error,
          });
        }
        return { accum, scratch };
      }
      processed = result.target;
      draw = { ...draw, ...result.draw };
    }
    const drawn = this.#compositor.drawLayer(accum, scratch, draw);
    if (processed !== null) this.#compositor.pool.release(processed);
    return drawn;
  }

  /**
   * A transition: the outgoing and incoming clips are each drawn alone at composition size (with
   * their own transform, colour, effects and opacity), a transition shader blends the two by
   * `progress`, and the result is composited with the incoming clip's blend mode. A missing
   * transition definition degrades to a hard cut and says so.
   */
  #drawTransition(
    context: RenderContext,
    accum: Target,
    scratch: Target,
    item: Extract<LayerPlanItem, { type: "transition" }>,
    a: LayerSource | null,
    b: LayerSource | null,
    tUs: number,
    composition: Composition,
    frame: number,
  ): { accum: Target; scratch: Target } {
    const def = transitionById(item.transition.transitionId);
    if (def === undefined) {
      context.diagnostics.add({
        clipId: item.to.id,
        level: "warning",
        code: "unknown_transition",
        message: `There is no transition "${item.transition.transitionId}"; the clips are cut instead.`,
      });
      const cut =
        item.progress < 0.5 ? { clip: item.from, source: a } : { clip: item.to, source: b };
      return cut.source === null
        ? { accum, scratch }
        : this.#drawClip(context, accum, scratch, cut.clip, cut.source, tUs, frame);
    }
    const pool = this.#compositor.pool;
    const { width, height } = composition;
    const side = (clip: Clip, source: LayerSource | null): Target => {
      const target = pool.acquire(width, height);
      this.#compositor.clear(target, { r: 0, g: 0, b: 0, a: 0 });
      if (source !== null) {
        const spare = pool.acquire(width, height);
        this.#drawClip(context, target, spare, clip, source, tUs, frame, "normal");
        pool.release(spare);
      }
      return target;
    };
    const from = side(item.from, a);
    const to = side(item.to, b);
    const blended = this.#fx.transition(
      def,
      new Params(def.params, item.transition.params),
      from,
      to,
      item.progress,
      frame,
    );
    pool.release(from);
    pool.release(to);
    const drawn = this.#compositor.drawLayer(accum, scratch, {
      texture: blended.texture,
      sourceKind: 1,
      flipV: true,
      layerWidth: width,
      layerHeight: height,
      rect: { x: 0, y: 0, width, height },
      matrix: IDENTITY,
      opacity: 1,
      blendMode: item.to.blendMode,
    });
    pool.release(blended);
    return drawn;
  }

  /**
   * An adjustment clip grades and applies effects to everything drawn below it (the composite so
   * far), mixed back by its opacity and blend mode. It covers the whole composition (crop still
   * applies); its transform is ignored.
   */
  #drawAdjustment(
    context: RenderContext,
    accum: Target,
    scratch: Target,
    clip: Clip,
    props: ResolvedLayerProps,
    frame: number,
  ): { accum: Target; scratch: Target } {
    if (!this.#fx.needs(props.clip)) return { accum, scratch };
    const source = {
      texture: accum.texture,
      width: accum.width,
      height: accum.height,
      sourceKind: 1 as const,
      flipV: true,
    };
    const result = this.#fx.process(source, props, IDENTITY, frame, (code, message) => {
      context.diagnostics.add({ clipId: clip.id, level: "warning", code, message });
    });
    if ("error" in result) {
      if (result.error !== "empty") {
        context.diagnostics.add({
          clipId: clip.id,
          level: "error",
          code: "render_error",
          message: result.error,
        });
      }
      return { accum, scratch };
    }
    const drawn = this.#compositor.drawLayer(accum, scratch, {
      ...result.draw,
      opacity: props.opacity,
      blendMode: props.blendMode,
    });
    this.#compositor.pool.release(result.target);
    return drawn;
  }

  /** A solid clip: a 1×1 texture of its colour, stretched over the composition. */
  async #resolveSolid(
    context: RenderContext,
    clip: Clip,
    composition: Composition,
  ): Promise<LayerSource> {
    context.usedClips.add(clip.id);
    const c = clip.solid?.color ?? { r: 1, g: 1, b: 1, a: 1 };
    const bytes = [c.r * c.a, c.g * c.a, c.b * c.a, c.a].map((v) =>
      Math.round(Math.min(1, Math.max(0, v)) * 255),
    );
    const key = `s:${bytes.join(",")}`;
    const entry = await this.#shared(key, () => {
      const gl = this.#gl;
      return Promise.resolve(
        this.#cache.put(key, 1, 1, (texture) => {
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            1,
            1,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            new Uint8Array(bytes),
          );
        }),
      );
    });
    return this.#asLayer(entry, { width: composition.width, height: composition.height });
  }

  /**
   * Text and caption clips: the styled text is drawn into a canvas, uploaded as a texture and cached
   * by what it says and how it looks (a caption's picture changes with the page and the spoken
   * word). Fonts are loaded first; an unknown family falls back to the browser's sans-serif.
   */
  async #resolveText(context: RenderContext, clip: Clip, tUs: number): Promise<LayerSource | null> {
    context.usedClips.add(clip.id);
    const data =
      clip.type === "caption" ? captionTextAt(clip, tUs - clip.startUs) : (clip.text ?? null);
    if (data === null) {
      if (clip.type === "text" && clip.text === undefined) {
        context.diagnostics.add({
          clipId: clip.id,
          level: "warning",
          code: "missing_text",
          message: "This text clip has no text.",
        });
      }
      return null; // a caption before its first word shows nothing
    }
    if (data.animators.length > 0) {
      context.diagnostics.add({
        clipId: clip.id,
        level: "warning",
        code: "ignored_text_animators",
        message: "Text animators aren't drawn yet; the text is shown still.",
      });
    }
    const families = [...new Set(data.runs.map((r) => r.fontFamily))];
    const loaded = await Promise.all(families.map((f) => this.#fonts.ensure(f)));
    families.forEach((family, i) => {
      if (loaded[i] !== true) {
        context.diagnostics.add({
          clipId: clip.id,
          level: "warning",
          code: "font_unavailable",
          message: `Font "${family}" isn't one of Lumacut's fonts, so a default one is used.`,
        });
      }
    });
    const key = `t:${JSON.stringify(data)}:${loaded.map(Number).join("")}`;
    const entry = await this.#shared(key, () => {
      const raster = renderText(data);
      const bitmap = raster.canvas.transferToImageBitmap();
      try {
        return Promise.resolve(
          this.#cache.put(key, raster.width, raster.height, (texture, reused) => {
            uploadSource(this.#gl, texture, bitmap, reused);
          }),
        );
      } finally {
        bitmap.close();
      }
    });
    return { ...this.#asLayer(entry), anchorCenter: true };
  }

  /** Loads the clip's LUT (if any) before drawing, and reports it if it can't be used. */
  async #prepareColour(context: RenderContext, clip: Clip): Promise<void> {
    const ref = clip.color.lut;
    if (ref === undefined || ref.intensity <= 0) return;
    const { error } = await this.#fx.colour.prepare(ref.lutId);
    if (error !== undefined) {
      context.diagnostics.add({
        clipId: clip.id,
        level: "warning",
        code: "lut_unavailable",
        message: `${error} The clip is shown without its LUT.`,
      });
    }
  }

  async #resolveLayer(
    context: RenderContext,
    clip: Clip,
    tUs: number,
    composition: Composition,
    extended = false,
  ): Promise<LayerSource | null> {
    reportIgnoredFeatures(clip, context.diagnostics);
    try {
      if (clip.type === "media") return await this.#resolveMedia(context, clip, tUs, extended);
      if (clip.type === "composition") {
        return await this.#resolveNested(context, clip, tUs, extended);
      }
      if (clip.type === "solid") return await this.#resolveSolid(context, clip, composition);
      if (clip.type === "text" || clip.type === "caption") {
        return await this.#resolveText(context, clip, tUs);
      }
      if (clip.type === "adjustment") return null; // drawn from the composite, see #drawAdjustment
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
    extended: boolean,
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
    // During a transition a clip is read just outside its trimmed range (its handles).
    const frame =
      extended && !isClipActive(clip, tUs)
        ? extendedSourceFrameIndex(clip, tUs, fps, asset.video.durationUs)
        : sourceFrameIndex(clip, tUs, fps);
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
    extended: boolean,
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
    const childTime =
      extended && !isClipActive(clip, tUs)
        ? extendedSourceInstantUs(clip, tUs, child.durationUs)
        : sourceInstantUs(clip, tUs);
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

  #scopeTarget: {
    width: number;
    height: number;
    fb: WebGLFramebuffer;
    rb: WebGLRenderbuffer;
  } | null = null;

  /** The canvas, shrunk on the GPU (linear filter) to `maxWidth`, read back top-down. */
  #readScope(width: number, height: number, maxWidth: number): ScopeSample {
    const gl = this.#gl;
    const w = Math.max(1, Math.min(width, Math.round(maxWidth)));
    const h = Math.max(1, Math.round((height * w) / width));
    let target = this.#scopeTarget;
    if (target?.width !== w || target.height !== h) {
      if (target !== null) {
        gl.deleteFramebuffer(target.fb);
        gl.deleteRenderbuffer(target.rb);
      }
      const rb = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, w, h);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, rb);
      target = { width: w, height: h, fb, rb };
      this.#scopeTarget = target;
    }
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, target.fb);
    gl.blitFramebuffer(0, 0, width, height, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.LINEAR);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
    const bottomUp = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, bottomUp);
    const rowBytes = w * 4;
    const pixels = new Uint8Array(bottomUp.length);
    for (let y = 0; y < h; y += 1) {
      pixels.set(bottomUp.subarray(y * rowBytes, (y + 1) * rowBytes), (h - 1 - y) * rowBytes);
    }
    return { width: w, height: h, pixels };
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
