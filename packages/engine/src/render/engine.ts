import type { Asset, Clip, Composition, Project, RasterMask } from "@lumacut/schema";
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
import { isAnimated } from "@lumacut/ops";
import { IDENTITY, croppedRect, layerMatrix, multiply, type Mat } from "../math/matrix.ts";
import { DEFAULT_LIMITS, EngineStats, type EngineLimits, type StatsSnapshot } from "../stats.ts";
import { frameIndexOf } from "../timeline/frames.ts";
import { planLayers, type LayerPlanItem, type MattePlan } from "../timeline/transitions.ts";
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
import { PaintRaster, paintExtent, paintResolution } from "../paint/index.ts";
import { renderMasks, type MaskBitmaps } from "../shapes/mask-raster.ts";
import { renderShape, shapeMetrics } from "../shapes/render-shape.ts";
import { LayerFx, type LayerGeometry } from "./layer-fx.ts";
import { reportIgnoredFeatures, resolveClipProps, type ResolvedLayerProps } from "./properties.ts";
import { ReaderPool } from "./reader-pool.ts";
import { viewMatrix, viewSize, type ViewWindow } from "./view.ts";
import { validateProject } from "./validate.ts";

/** A short fingerprint of the stroke list (ids in order), for texture cache keys. */
function hashIds(strokes: readonly { id: string }[]): string {
  let h = 2166136261;
  for (const { id } of strokes) {
    for (let i = 0; i < id.length; i += 1) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
    h = Math.imul(h ^ 44, 16777619);
  }
  return `${String(strokes.length)}.${(h >>> 0).toString(36)}`;
}

/** The long side of the `preview` rendition the worker makes for every image. */
const PREVIEW_SIDE = 2048;

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
  /**
   * Draw only this window of the composition at this scale (the canvas takes the window's output
   * size). Without it the whole composition is drawn at its own size.
   */
  view?: ViewWindow;
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
  /**
   * Layer pixels added to the transform's anchor: text uses the picture's centre (anchor 0,0
   * centres it), shapes the shape's own origin, so item positions are relative to the clip's x,y.
   */
  anchorShift?: { x: number; y: number };
}

interface RenderContext {
  diagnostics: DiagnosticSink;
  /** Length of one frame of the composition being drawn, in µs (motion blur's shutter is a fraction of it). */
  frameUs: number;
  /** Texture-cache keys the current frame is using; they must not be evicted mid-frame. */
  usedClips: Set<string>;
  /** Composition pixels -> output pixels for the composition being drawn (identity unless windowed). */
  view: Mat;
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
  #view: ViewWindow | null = null;
  /** Live canvases of paint layers (strokes are added to them incrementally), by clip id. */
  readonly #paintRasters = new Map<string, PaintRaster>();
  /** Bitmap-mask pictures loaded from library assets, by asset id (closed when evicted). */
  readonly #maskBitmaps = new Map<string, ImageBitmap>();
  /** Live edits of a bitmap mask (the mask brush) that haven't been saved as an asset yet. */
  readonly #maskOverrides = new Map<
    string,
    { clipId: string; mask: RasterMask; bitmap: ImageBitmap; version: number }
  >();
  #overrideVersion = 0;
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

  /**
   * The window every later render draws (a photo editor's visible part of the canvas), unless a
   * render asks for its own. Null draws the whole composition at its own size.
   */
  setView(view: ViewWindow | null): void {
    this.#view = view;
  }

  /**
   * Shows `bitmap` (its alpha channel) as bitmap mask `mask` of clip `clipId` instead of whatever
   * the project says, until it is cleared with null. The mask brush uses this to show strokes the
   * moment they are painted, before the picture is saved as an asset. The engine owns the bitmap.
   */
  setMaskOverride(
    maskId: string,
    entry: { clipId: string; mask: RasterMask; bitmap: ImageBitmap } | null,
  ): void {
    this.#maskOverrides.get(maskId)?.bitmap.close();
    if (entry === null) {
      this.#maskOverrides.delete(maskId);
      return;
    }
    this.#overrideVersion += 1;
    this.#maskOverrides.set(maskId, { ...entry, version: this.#overrideVersion });
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
    for (const bitmap of this.#maskBitmaps.values()) bitmap.close();
    this.#maskBitmaps.clear();
    for (const { bitmap } of this.#maskOverrides.values()) bitmap.close();
    this.#maskOverrides.clear();
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
    const context: RenderContext = {
      diagnostics: new DiagnosticSink(),
      frameUs: (1_000_000 * composition.fps.den) / composition.fps.num,
      usedClips: new Set(),
      view: IDENTITY,
    };
    const view = options.view ?? this.#view ?? undefined;
    const size =
      view === undefined
        ? { width: composition.width, height: composition.height }
        : viewSize(view);
    if (Math.max(size.width, size.height) > this.caps.maxTextureSize) {
      throw new Error(
        `A ${String(size.width)}×${String(size.height)} render is larger than this GPU's ` +
          `${String(this.caps.maxTextureSize)} px limit; render it in tiles`,
      );
    }
    if (this.#canvas.width !== size.width) this.#canvas.width = size.width;
    if (this.#canvas.height !== size.height) this.#canvas.height = size.height;

    const target = await this.#renderComposition(context, composition, tUs, view);
    this.#compositor.present(target);
    const pixels = options.readback ? this.#readCanvas(size.width, size.height) : undefined;

    const scope =
      options.scopeWidth === undefined
        ? undefined
        : this.#readScope(size.width, size.height, options.scopeWidth);

    this.#compositor.pool.release(target);
    for (const id of [...this.#paintRasters.keys()]) {
      if (!context.usedClips.has(id)) this.#paintRasters.delete(id);
    }
    this.#cache.unpinAll();
    await this.#readers.trim(context.usedClips);
    this.stats.rendersCompleted += 1;
    return {
      compositionId,
      tUs,
      width: size.width,
      height: size.height,
      diagnostics: context.diagnostics.list(),
      renderMs: this.#clock.nowMs() - started,
      ...(pixels === undefined ? {} : { pixels }),
      ...(scope === undefined ? {} : { scope }),
    };
  }

  /**
   * Draws a composition into a pooled target; the caller releases it. With a `view`, only that
   * window is drawn, at its scale (nested compositions are always drawn whole).
   */
  async #renderComposition(
    context: RenderContext,
    base: Composition,
    tUs: number,
    view?: ViewWindow,
  ): Promise<Target> {
    const composition = this.#withOverrides(base);
    const scale = view?.scale ?? 1;
    const size =
      view === undefined
        ? { width: composition.width, height: composition.height }
        : viewSize(view);
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
          await this.#prepareClip(context, item.clip);
          const source = await this.#resolveLayer(
            context,
            item.clip,
            tUs,
            composition,
            false,
            scale,
          );
          const matteClip = item.matte?.source ?? null;
          if (matteClip === null) return { source };
          await this.#prepareClip(context, matteClip);
          return {
            source,
            matte: await this.#resolveLayer(context, matteClip, tUs, composition, false, scale),
          };
        }
        await Promise.all([
          this.#prepareClip(context, item.from),
          this.#prepareClip(context, item.to),
        ]);
        const [a, b] = await Promise.all([
          this.#resolveLayer(context, item.from, tUs, composition, true, scale),
          this.#resolveLayer(context, item.to, tUs, composition, true, scale),
        ]);
        return { a, b };
      }),
    );

    // Nested compositions were drawn above (while resolving); from here on we draw this one.
    context.frameUs = (1_000_000 * composition.fps.den) / composition.fps.num;
    let accum = this.#compositor.pool.acquire(size.width, size.height);
    let scratch = this.#compositor.pool.acquire(size.width, size.height);
    this.#compositor.clear(accum, composition.background);
    const frame = frameIndexOf(composition, tUs);
    // Drawing is synchronous (all awaiting happened above), so the view can't leak into a sibling.
    const outerView = context.view;
    context.view = view === undefined ? IDENTITY : viewMatrix(view);
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
      if (item.matte !== undefined) {
        if (item.matte.missing) {
          context.diagnostics.add({
            clipId: item.clip.id,
            level: "warning",
            code: "matte_missing",
            message:
              "The clip used as this clip's track matte isn't in the composition; no matte is applied.",
          });
        } else {
          ({ accum, scratch } = this.#drawMatted(
            context,
            accum,
            scratch,
            item.clip,
            item.matte,
            entry.source,
            entry.matte ?? null,
            tUs,
            frame,
          ));
          return;
        }
      }
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
    context.view = outerView;
    this.#compositor.pool.release(scratch);
    return accum;
  }

  /**
   * The picture of a clip's path masks for this frame, as a texture (cached by what the masks are
   * and where the layer sits, so an unanimated mask is drawn once).
   */
  #maskTexture(
    clip: Clip,
    place: LayerGeometry & { source: { width: number; height: number } },
  ): WebGLTexture | undefined {
    const bitmaps = this.#bitmapsFor(clip);
    const versions = clip.masks.map((m) => this.#maskOverrides.get(m.id)?.version ?? 0).join(",");
    const key = `m:${JSON.stringify(clip.masks)}:${versions}:${[place.x0, place.y0, place.s, place.pad, place.width, place.height, place.source.width, place.source.height].join(",")}`;
    const cached = this.#cache.get(key);
    if (cached !== undefined) {
      this.#cache.pin(key);
      return cached.texture;
    }
    const canvas = renderMasks(
      clip.masks,
      { ...place, layerWidth: place.source.width, layerHeight: place.source.height },
      bitmaps,
    );
    if (canvas === null) return undefined;
    const bitmap = canvas.transferToImageBitmap();
    try {
      const entry = this.#cache.put(key, place.width, place.height, (texture, reused) => {
        uploadSource(this.#gl, texture, bitmap, reused);
      });
      this.#cache.pin(key);
      return entry.texture;
    } finally {
      bitmap.close();
    }
  }

  /**
   * Draws one clip over `accum`. With motion blur on and something animating, the clip is drawn
   * N times at instants spread across the shutter (centred on this frame) and the pictures are
   * averaged; otherwise it is drawn once.
   */
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
    const blur = clip.motionBlur;
    if (!blur.enabled || !isAnimated(clip) || blur.shutterAngle <= 0 || blur.samples < 2) {
      return this.#drawClipOnce(context, accum, scratch, clip, source, tUs, frame, blendOverride);
    }
    const pool = this.#compositor.pool;
    const { width, height } = accum;
    const samples = Math.min(64, Math.max(2, Math.round(blur.samples)));
    const shutterUs = (blur.shutterAngle / 360) * context.frameUs;
    const sum = pool.acquire(width, height);
    this.#compositor.clear(sum, { r: 0, g: 0, b: 0, a: 0 });
    for (let i = 0; i < samples; i += 1) {
      const at = tUs + (i / (samples - 1) - 0.5) * shutterUs;
      const one = pool.acquire(width, height);
      this.#compositor.clear(one, { r: 0, g: 0, b: 0, a: 0 });
      const spare = pool.acquire(width, height);
      this.#drawClipOnce(context, one, spare, clip, source, at, frame, "normal");
      pool.release(spare);
      this.#fx.accumulate(one, sum, 1 / samples, frame);
      pool.release(one);
    }
    const drawn = this.#compositor.drawLayer(accum, scratch, {
      texture: sum.texture,
      sourceKind: 1,
      flipV: true,
      layerWidth: width,
      layerHeight: height,
      rect: { x: 0, y: 0, width, height },
      matrix: IDENTITY,
      opacity: 1,
      blendMode: blendOverride ?? clip.blendMode,
    });
    pool.release(sum);
    return drawn;
  }

  /** Draws one clip (crop, colour, effects, transform, opacity, blend) over `accum`, at time `tUs`. */
  #drawClipOnce(
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
      source.anchorShift === undefined
        ? props.transform
        : {
            ...props.transform,
            anchorX: props.transform.anchorX + source.anchorShift.x,
            anchorY: props.transform.anchorY + source.anchorShift.y,
          };
    const matrix = multiply(context.view, layerMatrix(transform));
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
      const report = (code: string, message: string): void => {
        context.diagnostics.add({ clipId: clip.id, level: "warning", code, message });
      };
      let mask: WebGLTexture | undefined;
      if (props.clip.masks.length > 0) {
        const geometry = this.#fx.geometry(source, props, matrix, report);
        if (!("error" in geometry)) {
          mask = this.#maskTexture(props.clip, { ...geometry, source });
        }
      }
      const result = this.#fx.process(source, props, matrix, frame, report, mask);
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

  /** One clip drawn by itself onto a transparent composition-sized target (normal blend). */
  #drawAlone(
    context: RenderContext,
    clip: Clip,
    source: LayerSource | null,
    tUs: number,
    frame: number,
    width: number,
    height: number,
  ): Target {
    const pool = this.#compositor.pool;
    const target = pool.acquire(width, height);
    this.#compositor.clear(target, { r: 0, g: 0, b: 0, a: 0 });
    if (source !== null) {
      const spare = pool.acquire(width, height);
      this.#drawClip(context, target, spare, clip, source, tUs, frame, "normal");
      pool.release(spare);
    }
    return target;
  }

  /**
   * A clip with a track matte: the clip and its matte clip are each drawn alone, the matte shader
   * multiplies the clip by the matte (alpha or luma, optionally inverted), and the result is
   * composited with the clip's blend mode.
   */
  #drawMatted(
    context: RenderContext,
    accum: Target,
    scratch: Target,
    clip: Clip,
    matte: MattePlan,
    source: LayerSource,
    matteSource: LayerSource | null,
    tUs: number,
    frame: number,
  ): { accum: Target; scratch: Target } {
    const pool = this.#compositor.pool;
    const { width, height } = accum;
    const alone = this.#drawAlone(context, clip, source, tUs, frame, width, height);
    const matteClip = matte.source;
    const stencil = this.#drawAlone(
      context,
      matteClip ?? clip,
      matteClip === null ? null : matteSource,
      tUs,
      frame,
      width,
      height,
    );
    const mode = ["alpha", "alphaInverted", "luma", "lumaInverted"].indexOf(matte.mode);
    const result = this.#fx.matte(alone, stencil, mode, frame);
    pool.release(alone);
    pool.release(stencil);
    const drawn = this.#compositor.drawLayer(accum, scratch, {
      texture: result.texture,
      sourceKind: 1,
      flipV: true,
      layerWidth: width,
      layerHeight: height,
      rect: { x: 0, y: 0, width, height },
      matrix: IDENTITY,
      opacity: 1,
      blendMode: clip.blendMode,
    });
    pool.release(result);
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
    const { width, height } = accum;
    const from = this.#drawAlone(context, item.from, a, tUs, frame, width, height);
    const to = this.#drawAlone(context, item.to, b, tUs, frame, width, height);
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
    return { ...this.#asLayer(entry), anchorShift: { x: entry.width / 2, y: entry.height / 2 } };
  }

  /**
   * Shape clips: outlines are drawn into a canvas (fill, stroke, dash, trim paths, rounded
   * corners) at 1, 2 or 4 pixels per layer pixel, whichever covers the size the layer is drawn at,
   * and cached by what the shape is (an animated shape makes a new picture each frame).
   */
  async #resolveShape(
    context: RenderContext,
    clip: Clip,
    tUs: number,
    scale: number,
  ): Promise<LayerSource | null> {
    context.usedClips.add(clip.id);
    const props = resolveClipProps(clip, tUs);
    const shape = props.clip.shape;
    if (shape === undefined || shape.items.length === 0) return null;
    const drawn = Math.max(
      Math.max(Math.abs(props.transform.scaleX), Math.abs(props.transform.scaleY)) * scale,
      1,
    );
    const resolution = Math.min(4, 2 ** Math.ceil(Math.log2(drawn)));
    const key = `sh:${JSON.stringify(shape)}:${String(resolution)}`;
    const metrics = shapeMetrics(shape);
    if (metrics === null) return null;
    const entry = await this.#shared(key, () => {
      const raster = renderShape(shape, resolution);
      if (raster === null) return Promise.reject(new Error("The shape has nothing to draw."));
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
    return {
      ...this.#asLayer(entry, { width: metrics.layerWidth, height: metrics.layerHeight }),
      anchorShift: { x: metrics.originX, y: metrics.originY },
    };
  }

  /**
   * Paint layers: brush and eraser strokes drawn (with Canvas 2D stamps) onto a canvas that covers
   * the composition plus wherever strokes reach outside it, at a power-of-two fraction of full
   * size that suits the zoom. New strokes are added to the live canvas; the picture is uploaded when
   * the list changes.
   */
  async #resolvePaint(
    context: RenderContext,
    clip: Clip,
    composition: Composition,
    scale: number,
  ): Promise<LayerSource | null> {
    context.usedClips.add(clip.id);
    const strokes = clip.paint?.strokes ?? [];
    if (strokes.length === 0) return null;
    const extent = paintExtent(strokes, composition.width, composition.height);
    const drawn =
      Math.max(Math.abs(clip.transform.scaleX), Math.abs(clip.transform.scaleY)) * scale;
    const res = paintResolution(drawn, extent.width, extent.height);
    const width = Math.max(1, Math.ceil(extent.width * res));
    const height = Math.max(1, Math.ceil(extent.height * res));
    let raster = this.#paintRasters.get(clip.id);
    if (raster?.canvas.width !== width || raster.canvas.height !== height) {
      raster = new PaintRaster(width, height);
      this.#paintRasters.set(clip.id, raster);
    }
    raster.update(strokes, { x0: extent.x0, y0: extent.y0, scale: res });
    const key = `p:${clip.id}:${String(res)}:${[extent.x0, extent.y0, extent.width, extent.height].join(",")}:${hashIds(strokes)}`;
    const live = raster;
    const entry = await this.#shared(key, async () => {
      const bitmap = await createImageBitmap(live.canvas, { premultiplyAlpha: "premultiply" });
      try {
        return this.#cache.put(key, width, height, (texture, reused) => {
          uploadSource(this.#gl, texture, bitmap, reused);
        });
      } finally {
        bitmap.close();
      }
    });
    return {
      ...this.#asLayer(entry, { width: extent.width, height: extent.height }),
      anchorShift: { x: -extent.x0, y: -extent.y0 },
    };
  }

  /** The composition with live bitmap-mask edits applied to its clips (itself when there are none). */
  #withOverrides(composition: Composition): Composition {
    if (this.#maskOverrides.size === 0) return composition;
    const edits = [...this.#maskOverrides.values()];
    if (
      !composition.tracks.some((t) => t.clips.some((c) => edits.some((e) => e.clipId === c.id)))
    ) {
      return composition;
    }
    return {
      ...composition,
      tracks: composition.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) => {
          const mine = edits.filter((e) => e.clipId === clip.id);
          if (mine.length === 0) return clip;
          let masks = clip.masks;
          for (const { mask } of mine) {
            masks = masks.some((m) => m.id === mask.id)
              ? masks.map((m) => (m.id === mask.id ? mask : m))
              : [...masks, mask];
          }
          return { ...clip, masks };
        }),
      })),
    };
  }

  /** The pictures of a clip's bitmap masks that are loaded (a live edit wins over the saved asset). */
  #bitmapsFor(clip: Clip): MaskBitmaps {
    const found = new Map<string, ImageBitmap>();
    for (const mask of clip.masks) {
      if (mask.kind !== "raster") continue;
      const bitmap =
        this.#maskOverrides.get(mask.id)?.bitmap ?? this.#maskBitmaps.get(mask.assetId);
      if (bitmap !== undefined) found.set(mask.id, bitmap);
    }
    return found;
  }

  /** Loads what a clip needs before it can be drawn: its LUT and the pictures of its bitmap masks. */
  async #prepareClip(context: RenderContext, clip: Clip): Promise<void> {
    await this.#prepareMasks(context, clip);
    await this.#prepareColour(context, clip);
  }

  async #prepareMasks(context: RenderContext, clip: Clip): Promise<void> {
    for (const mask of clip.masks) {
      if (mask.kind !== "raster" || this.#maskOverrides.has(mask.id)) continue;
      if (this.#maskBitmaps.has(mask.assetId)) continue;
      try {
        const url = await this.#resolver.resolve(mask.assetId, "image");
        this.#maskBitmaps.set(
          mask.assetId,
          await loadImageBitmap(mask.assetId, url, this.caps.maxTextureSize),
        );
        // Keep the few most recently loaded; older ones are reloaded if needed again.
        for (const [id, bitmap] of this.#maskBitmaps) {
          if (this.#maskBitmaps.size <= 12) break;
          if (id === mask.assetId) continue;
          bitmap.close();
          this.#maskBitmaps.delete(id);
        }
      } catch (error) {
        context.diagnostics.add({
          clipId: clip.id,
          level: "warning",
          code: "raster_mask_unavailable",
          message: `A bitmap mask couldn't be loaded (${error instanceof Error ? error.message : String(error)}); it is left out.`,
        });
      }
    }
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
    scale = 1,
  ): Promise<LayerSource | null> {
    reportIgnoredFeatures(clip, context.diagnostics);
    try {
      if (clip.type === "media") {
        return await this.#resolveMedia(context, clip, tUs, extended, scale);
      }
      if (clip.type === "composition") {
        return await this.#resolveNested(context, clip, tUs, extended);
      }
      if (clip.type === "solid") return await this.#resolveSolid(context, clip, composition);
      if (clip.type === "text" || clip.type === "caption") {
        return await this.#resolveText(context, clip, tUs);
      }
      if (clip.type === "shape") return await this.#resolveShape(context, clip, tUs, scale);
      if (clip.type === "paint") return await this.#resolvePaint(context, clip, composition, scale);
      // Every other kind is an adjustment clip, drawn from the composite (see #drawAdjustment).
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
    scale: number,
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
      // While editing, an image that is drawn small uses its 2048 px preview (a proxy); drawn
      // larger (zoomed in, or exported) it uses the original. Images the GPU can't hold whole are
      // shrunk to fit; export draws large compositions in tiles.
      const long = Math.max(asset.image?.width ?? 0, asset.image?.height ?? 0);
      const sizeScale = Math.max(
        Math.abs(resolveClipProps(clip, tUs).transform.scaleX),
        Math.abs(resolveClipProps(clip, tUs).transform.scaleY),
      );
      const useProxy = long > PREVIEW_SIDE && long * sizeScale * scale <= PREVIEW_SIDE;
      const rendition = useProxy ? "preview" : "image";
      const key = `i:${asset.id}:${rendition}`;
      const entry = await this.#shared(key, async () => {
        const url = await this.#resolver.resolve(asset.id, rendition).catch((error: unknown) => {
          if (rendition === "image") throw error;
          return this.#resolver.resolve(asset.id, "image"); // no preview rendition: use the original
        });
        const bitmap = await loadImageBitmap(asset.id, url, this.caps.maxTextureSize);
        try {
          return this.#cache.put(key, bitmap.width, bitmap.height, (texture, reused) => {
            uploadSource(this.#gl, texture, bitmap, reused);
          });
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
    const edits = [...this.#maskOverrides.values()].map((e) => `${e.mask.id}.${String(e.version)}`);
    const key = `n:${child.id}:${hash}:${edits.join(",")}:${String(childTime)}`;
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
