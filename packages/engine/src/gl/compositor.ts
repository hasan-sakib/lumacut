import type { BlendMode, Color } from "@lumacut/schema";
import { blendModeIndex } from "../blend/modes.ts";
import { multiply, projection, toMat3, type Mat } from "../math/matrix.ts";
import type { EngineStats } from "../stats.ts";
import { createProgram, uniformLocations } from "./program.ts";
import { SHADERS } from "./shaders.ts";
import { TargetPool, type Target } from "./targets.ts";
import { required } from "./util.ts";

export interface LayerDraw {
  texture: WebGLTexture;
  /** 0: 8-bit sRGB-encoded premultiplied (video, images). 1: linear premultiplied (nested comps). */
  sourceKind: 0 | 1;
  /** True for render-target textures, which are stored bottom-up. */
  flipV: boolean;
  layerWidth: number;
  layerHeight: number;
  /** Visible (cropped) rectangle in layer pixels. */
  rect: { x: number; y: number; width: number; height: number };
  /** Layer pixels -> composition pixels. */
  matrix: Mat;
  opacity: number;
  blendMode: BlendMode;
}

const LAYER_UNIFORMS = [
  "uToClip",
  "uRect",
  "uLayerSize",
  "uLayer",
  "uBackdrop",
  "uOpacity",
  "uSourceKind",
  "uFlipV",
  "uMode",
] as const;

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/**
 * Draws layers into linear, premultiplied RGBA16F accumulation buffers and presents the result as
 * sRGB. `normal` blending uses fixed-function blending; every other mode copies the backdrop and
 * evaluates the blend function in the shader.
 */
export class Compositor {
  readonly #gl: WebGL2RenderingContext;
  readonly #stats: EngineStats;
  readonly pool: TargetPool;
  readonly #normalProgram: WebGLProgram;
  readonly #blendProgram: WebGLProgram;
  readonly #presentProgram: WebGLProgram;
  readonly #normal: ReturnType<typeof uniformLocations<(typeof LAYER_UNIFORMS)[number]>>;
  readonly #blend: ReturnType<typeof uniformLocations<(typeof LAYER_UNIFORMS)[number]>>;
  readonly #presentAccum: WebGLUniformLocation | null;
  readonly #quad: WebGLVertexArrayObject;
  readonly #quadBuffer: WebGLBuffer;
  readonly #emptyVao: WebGLVertexArrayObject;

  constructor(gl: WebGL2RenderingContext, stats: EngineStats) {
    this.#gl = gl;
    this.#stats = stats;
    this.pool = new TargetPool(gl, stats);
    this.#normalProgram = createProgram(gl, "layer", SHADERS.layerVert, SHADERS.layerFragNormal);
    this.#blendProgram = createProgram(
      gl,
      "layer-blend",
      SHADERS.layerVert,
      SHADERS.layerFragBlend,
    );
    this.#presentProgram = createProgram(
      gl,
      "present",
      SHADERS.fullscreenVert,
      SHADERS.presentFrag,
    );
    this.#normal = uniformLocations(gl, this.#normalProgram, LAYER_UNIFORMS);
    this.#blend = uniformLocations(gl, this.#blendProgram, LAYER_UNIFORMS);
    this.#presentAccum = gl.getUniformLocation(this.#presentProgram, "uAccum");

    // Unit quad as a triangle strip; the vertex shader pins `aCorner` to attribute 0.
    this.#quad = required(gl.createVertexArray(), "vertex array");
    this.#quadBuffer = required(gl.createBuffer(), "buffer");
    gl.bindVertexArray(this.#quad);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.#emptyVao = required(gl.createVertexArray(), "vertex array");
    gl.bindVertexArray(null);
  }

  /** Fills a target with the composition background (premultiplied, linear). */
  clear(target: Target, background: Color): void {
    const gl = this.#gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, target.width, target.height);
    const a = background.a;
    gl.clearColor(
      srgbToLinear(background.r) * a,
      srgbToLinear(background.g) * a,
      srgbToLinear(background.b) * a,
      a,
    );
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  /**
   * Draws one layer over `accum`. Returns which target now holds the result: the blend path
   * writes into `scratch`, so the two swap roles.
   */
  drawLayer(accum: Target, scratch: Target, layer: LayerDraw): { accum: Target; scratch: Target } {
    const { rect } = layer;
    if (rect.width <= 0 || rect.height <= 0 || layer.opacity <= 0) return { accum, scratch };
    const gl = this.#gl;
    const mode = blendModeIndex(layer.blendMode);
    const useBlend = mode !== 0;
    const program = useBlend ? this.#blendProgram : this.#normalProgram;
    const u = useBlend ? this.#blend : this.#normal;
    const destination = useBlend ? scratch : accum;

    if (useBlend) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, accum.framebuffer);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, scratch.framebuffer);
      gl.blitFramebuffer(
        0,
        0,
        accum.width,
        accum.height,
        0,
        0,
        accum.width,
        accum.height,
        gl.COLOR_BUFFER_BIT,
        gl.NEAREST,
      );
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, destination.framebuffer);
    gl.viewport(0, 0, destination.width, destination.height);
    gl.useProgram(program);
    gl.bindVertexArray(this.#quad);

    const toClip = multiply(projection(accum.width, accum.height), layer.matrix);
    gl.uniformMatrix3fv(u.uToClip, false, toMat3(toClip));
    gl.uniform4f(u.uRect, rect.x, rect.y, rect.width, rect.height);
    gl.uniform2f(u.uLayerSize, layer.layerWidth, layer.layerHeight);
    gl.uniform1f(u.uOpacity, layer.opacity);
    gl.uniform1i(u.uSourceKind, layer.sourceKind);
    gl.uniform1i(u.uFlipV, layer.flipV ? 1 : 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, layer.texture);
    gl.uniform1i(u.uLayer, 0);
    if (useBlend) {
      gl.uniform1i(u.uMode, mode);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, accum.texture);
      gl.uniform1i(u.uBackdrop, 1);
      gl.disable(gl.BLEND);
    } else {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // premultiplied source-over
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
    this.#stats.layersDrawn += 1;
    return useBlend ? { accum: scratch, scratch: accum } : { accum, scratch };
  }

  /** Copies `source` into `destination` (same size, both RGBA16F). */
  copy(source: Target, destination: WebGLFramebuffer): void {
    const gl = this.#gl;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, source.framebuffer);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, destination);
    gl.blitFramebuffer(
      0,
      0,
      source.width,
      source.height,
      0,
      0,
      source.width,
      source.height,
      gl.COLOR_BUFFER_BIT,
      gl.NEAREST,
    );
  }

  /** Converts the linear composition to sRGB and draws it to the canvas. */
  present(accum: Target): void {
    const gl = this.#gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, accum.width, accum.height);
    gl.disable(gl.BLEND);
    gl.useProgram(this.#presentProgram);
    gl.bindVertexArray(this.#emptyVao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, accum.texture);
    gl.uniform1i(this.#presentAccum, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    const gl = this.#gl;
    this.pool.dispose();
    gl.deleteProgram(this.#normalProgram);
    gl.deleteProgram(this.#blendProgram);
    gl.deleteProgram(this.#presentProgram);
    gl.deleteVertexArray(this.#quad);
    gl.deleteVertexArray(this.#emptyVao);
    gl.deleteBuffer(this.#quadBuffer);
  }
}
