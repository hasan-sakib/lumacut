import {
  Params,
  effectById,
  type EffectDefinition,
  type TransitionDefinition,
} from "@lumacut/effects";
import type { Clip, EffectInstance } from "@lumacut/schema";
import { ColorResources } from "../color/resources.ts";
import { isNeutralColor, hasCurves } from "../color/settings.ts";
import { FxRunner } from "../gl/fx.ts";
import type { LayerDraw } from "../gl/compositor.ts";
import colorSource from "../gl/shaders/color.frag.glsl?raw";
import effectCommon from "../gl/shaders/effect-common.glsl?raw";
import accumulateSource from "../gl/shaders/accumulate.frag.glsl?raw";
import maskSource from "../gl/shaders/mask.frag.glsl?raw";
import matteSource from "../gl/shaders/matte.frag.glsl?raw";
import transitionCommon from "../gl/shaders/transition-common.glsl?raw";
import sourceSource from "../gl/shaders/source.frag.glsl?raw";
import type { Target, TargetPool } from "../gl/targets.ts";
import { croppedRect, multiply, translate, scale, type Mat } from "../math/matrix.ts";
import type { MediaResolver } from "../decode/media.ts";
import type { EngineStats } from "../stats.ts";
import type { ResolvedLayerProps } from "./properties.ts";

export interface FxSource {
  texture: WebGLTexture;
  width: number;
  height: number;
  sourceKind: 0 | 1;
  flipV: boolean;
}

/** Where a layer's processed picture sits (see `LayerFx.geometry`). */
export interface LayerGeometry {
  rect: { x: number; y: number; width: number; height: number };
  x0: number;
  y0: number;
  /** Target pixels per layer pixel. */
  s: number;
  /** Margin in target pixels. */
  pad: number;
  width: number;
  height: number;
  effects: { def: EffectDefinition; params: Params; instance: EffectInstance }[];
}

/** A layer after colour and effects: a target to draw, and how it maps onto the composition. */
export interface ProcessedLayer {
  target: Target;
  /** Draw parameters for the compositor; the caller adds opacity and blend mode. */
  draw: Pick<
    LayerDraw,
    "texture" | "sourceKind" | "flipV" | "layerWidth" | "layerHeight" | "rect" | "matrix"
  >;
}

const MIN_SCALE = 1 / 8;

/**
 * The part of the SPEC §6 pipeline between "source" and "transform": crop → colour → effects.
 * A layer with neutral colour and no effects skips all of it (the compositor draws it directly).
 */
export class LayerFx {
  readonly #pool: TargetPool;
  readonly runner: FxRunner;
  readonly colour: ColorResources;
  readonly #maxTexture: number;

  constructor(
    gl: WebGL2RenderingContext,
    stats: EngineStats,
    pool: TargetPool,
    resolver: MediaResolver,
    maxTextureSize: number,
  ) {
    this.#pool = pool;
    this.runner = new FxRunner(gl, stats);
    this.colour = new ColorResources(gl, resolver);
    this.#maxTexture = maxTextureSize;
  }

  /** True when the clip needs the colour pass. */
  needsColour(clip: Clip): boolean {
    return !isNeutralColor(clip.color);
  }

  /** Enabled effects with their definitions and parameters; unknown effects are reported and skipped. */
  #effects(
    clip: Clip,
    report?: (code: string, message: string) => void,
  ): { def: EffectDefinition; params: Params; instance: EffectInstance }[] {
    const found: { def: EffectDefinition; params: Params; instance: EffectInstance }[] = [];
    for (const instance of clip.effects) {
      if (!instance.enabled) continue;
      const def = effectById(instance.effectId);
      if (def === undefined) {
        report?.("unknown_effect", `There is no effect "${instance.effectId}"; it was skipped.`);
        continue;
      }
      found.push({ def, params: new Params(def.params, instance.params), instance });
    }
    return found;
  }

  /** True when the clip needs colour or effect passes (otherwise it is drawn directly). */
  needs(clip: Clip): boolean {
    return this.needsColour(clip) || clip.effects.some((e) => e.enabled) || clip.masks.length > 0;
  }

  /**
   * Where a layer's processed picture sits: the whole-pixel region of the layer it covers, the
   * resolution it is processed at and the margin effects need. Masks are drawn to match.
   */
  geometry(
    source: FxSource,
    props: ResolvedLayerProps,
    matrix: Mat,
    report?: (code: string, message: string) => void,
  ): LayerGeometry | { error: string } {
    const rect = croppedRect(source.width, source.height, props.crop);
    if (rect.width <= 0 || rect.height <= 0) return { error: "empty" };
    const drawnScale = Math.max(Math.hypot(matrix[0], matrix[1]), Math.hypot(matrix[2], matrix[3]));
    const s = Math.min(1, Math.max(MIN_SCALE, drawnScale));
    const effects = this.#effects(props.clip, report);
    // Effects that spread (blur, glow, shadow) need room around the layer.
    const padLayer = effects.reduce((sum, e) => sum + (e.def.expand?.(e.params) ?? 0), 0);
    const pad = Math.ceil(padLayer * s);
    // Whole layer pixels around the (possibly fractional) crop, so that at full size the target's
    // pixel grid is the layer's and processing doesn't resample anything.
    const x0 = Math.floor(rect.x);
    const y0 = Math.floor(rect.y);
    const spanW = Math.ceil(rect.x + rect.width) - x0;
    const spanH = Math.ceil(rect.y + rect.height) - y0;
    const width = Math.max(1, Math.ceil(spanW * s)) + 2 * pad;
    const height = Math.max(1, Math.ceil(spanH * s)) + 2 * pad;
    if (Math.max(width, height) > this.#maxTexture) {
      return {
        error: `the layer is ${String(width)}×${String(height)}, larger than this GPU's ${String(this.#maxTexture)} px texture limit`,
      };
    }
    return { rect, x0, y0, s, pad, width, height, effects };
  }

  /** Adds `source` × `weight` onto `destination` (used to average motion-blur samples). */
  accumulate(source: Target, destination: Target, weight: number, frame: number): void {
    this.runner.run(
      {
        program: this.runner.program("accumulate", accumulateSource),
        destination,
        blend: "add",
        inputs: [{ name: "uSrc", texture: source.texture }],
        uniforms: { uWeight: weight },
      },
      frame,
    );
  }

  /** Blends two composition-sized pictures with a track matte; the caller releases all three targets. */
  matte(clip: Target, matte: Target, mode: number, frame: number): Target {
    const destination = this.#pool.acquire(clip.width, clip.height);
    this.runner.run(
      {
        program: this.runner.program("matte", matteSource),
        destination,
        inputs: [
          { name: "uClip", texture: clip.texture },
          { name: "uMatte", texture: matte.texture },
        ],
        uniforms: { uMode: { int: mode } },
      },
      frame,
    );
    return destination;
  }

  /**
   * Runs crop → colour on one layer. `matrix` is the layer's layer→composition matrix; the layer is
   * processed at no more resolution than it is drawn at, so a 4K clip on a 1080p canvas doesn't
   * cost 4K passes.
   */
  process(
    source: FxSource,
    props: ResolvedLayerProps,
    matrix: Mat,
    frame: number,
    report?: (code: string, message: string) => void,
    mask?: WebGLTexture,
  ): ProcessedLayer | { error: string } {
    const layout = this.geometry(source, props, matrix, report);
    if ("error" in layout) return layout;
    const { rect, x0, y0, s, pad, width, height, effects } = layout;

    const sourcePass = this.runner.program("source", sourceSource);
    let current = this.#pool.acquire(width, height);
    this.runner.run(
      {
        program: sourcePass,
        destination: current,
        inputs: [{ name: "uSrc", texture: source.texture }],
        uniforms: {
          uSrcKind: { int: source.sourceKind },
          uSrcFlipV: source.flipV,
          uSrcSize: [source.width, source.height],
          uRect: [rect.x, rect.y, rect.width, rect.height],
          uOrigin: [x0, y0],
          uPad: pad,
          uScale: s,
        },
      },
      frame,
    );

    if (mask !== undefined) {
      const next = this.#pool.acquire(width, height);
      this.runner.run(
        {
          program: this.runner.program("mask", maskSource),
          destination: next,
          inputs: [
            { name: "uSrc", texture: current.texture },
            { name: "uMask", texture: mask },
          ],
          uniforms: {},
        },
        frame,
      );
      this.#pool.release(current);
      current = next;
    }

    if (this.needsColour(props.clip)) {
      const next = this.#pool.acquire(width, height);
      this.#colourPass(props.clip, current, next, frame);
      this.#pool.release(current);
      current = next;
    }

    for (const { def, params } of effects) {
      current = this.#runEffect(def, params, current, { scale: s, frame, pad, width, height });
    }

    // Target pixel t covers layer pixel origin + (t − pad) / s.
    const toLayer = multiply(translate(x0 - pad / s, y0 - pad / s), scale(1 / s, 1 / s));
    return {
      target: current,
      draw: {
        texture: current.texture,
        sourceKind: 1,
        flipV: true,
        layerWidth: width,
        layerHeight: height,
        rect: { x: 0, y: 0, width, height },
        matrix: multiply(matrix, toLayer),
      },
    };
  }

  /** Blends two composition-sized renders with a transition; the caller releases all three targets. */
  transition(
    def: TransitionDefinition,
    params: Params,
    from: Target,
    to: Target,
    progress: number,
    frame: number,
  ): Target {
    const destination = this.#pool.acquire(from.width, from.height);
    this.runner.run(
      {
        program: this.runner.program(`tr:${def.shader}`, `${transitionCommon}\n${def.shader}`),
        destination,
        inputs: [
          { name: "uA", texture: from.texture },
          { name: "uB", texture: to.texture },
        ],
        uniforms: {
          uProgress: progress,
          ...def.uniforms?.(params, {
            progress,
            frame,
            width: from.width,
            height: from.height,
          }),
        },
      },
      frame,
    );
    return destination;
  }

  /** Runs an effect's passes: each reads the previous pass (`uSrc`) and the effect's input (`uOrig`). */
  #runEffect(
    def: EffectDefinition,
    params: Params,
    input: Target,
    run: { scale: number; frame: number; pad: number; width: number; height: number },
  ): Target {
    let previous = input;
    for (const pass of def.passes) {
      const destination = this.#pool.acquire(run.width, run.height);
      this.runner.run(
        {
          program: this.runner.program(`fx:${pass.shader}`, `${effectCommon}\n${pass.shader}`),
          destination,
          inputs: [
            { name: "uSrc", texture: previous.texture },
            { name: "uOrig", texture: input.texture },
          ],
          uniforms: {
            uScale: run.scale,
            uPad: run.pad,
            ...pass.uniforms?.(params, {
              scale: run.scale,
              frame: run.frame,
              width: run.width,
              height: run.height,
            }),
          },
        },
        run.frame,
      );
      if (previous !== input) this.#pool.release(previous);
      previous = destination;
    }
    this.#pool.release(input);
    return previous;
  }

  #colourPass(clip: Clip, from: Target, to: Target, frame: number): void {
    const c = clip.color;
    const curves = hasCurves(c) ? this.colour.curves(c) : undefined;
    const lutRef = c.lut !== undefined && c.lut.intensity > 0 ? c.lut : undefined;
    const lut = lutRef === undefined ? undefined : this.colour.lut(lutRef.lutId);
    const bands = c.hsl;
    const bandData =
      bands === undefined
        ? new Array<number>(24).fill(0)
        : [
            bands.red,
            bands.orange,
            bands.yellow,
            bands.green,
            bands.aqua,
            bands.blue,
            bands.purple,
            bands.magenta,
          ].flatMap((b) => [b.hue, b.saturation, b.luminance]);
    // Every sampler needs a texture of its kind bound, even when unused: stand-ins fill the gaps.
    this.runner.run(
      {
        program: this.runner.program("color", colorSource),
        destination: to,
        inputs: [
          { name: "uSrc", texture: from.texture },
          { name: "uCurves", texture: curves?.texture ?? from.texture },
          { name: "uLut", texture: lut?.texture ?? this.colour.placeholder3d, kind: "3d" },
        ],
        uniforms: {
          uTemperature: c.temperature,
          uTint: c.tint,
          uExposure: c.exposure,
          uContrast: c.contrast,
          uHighlights: c.highlights,
          uShadows: c.shadows,
          uWhites: c.whites,
          uBlacks: c.blacks,
          uSaturation: c.saturation,
          uVibrance: c.vibrance,
          uLift: c.lift,
          uGamma: c.gamma,
          uGain: c.gain,
          uOffset: c.offset,
          uHasCurves: curves !== undefined,
          uHasBands: bands !== undefined,
          uHasLut: lut !== undefined && lutRef !== undefined,
          uBands: { v3: bandData },
          uLutIntensity: lutRef?.intensity ?? 0,
          uLutDomainMin: lut?.cube.domainMin ?? [0, 0, 0],
          uLutDomainMax: lut?.cube.domainMax ?? [1, 1, 1],
          uLutSize: lut?.cube.size ?? 2,
        },
      },
      frame,
    );
  }

  dispose(): void {
    this.colour.dispose();
  }
}
