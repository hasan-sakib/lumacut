import type { ColorSettings } from "@lumacut/schema";
import type { MediaResolver } from "../decode/media.ts";
import { required } from "../gl/util.ts";
import { builtinLut, isBuiltinLut } from "./builtin-luts.ts";
import { CubeError, parseCube, to3d, type CubeLut } from "./cube.ts";
import { CURVE_ROWS, CURVE_SIZE, curveTable } from "./curves.ts";

export interface LutLoad {
  lut: CubeLut | null;
  /** Why it isn't available (shown as a diagnostic). */
  error?: string;
}

/**
 * GPU resources for the colour pass: the curves texture of a grade and 3D textures for LUTs,
 * created on demand and kept (they're small) until `dispose`.
 */
export class ColorResources {
  readonly #gl: WebGL2RenderingContext;
  readonly #resolver: MediaResolver;
  readonly #curves = new Map<string, WebGLTexture>();
  readonly #luts = new Map<string, { texture: WebGLTexture; cube: CubeLut }>();
  readonly #pending = new Map<string, Promise<LutLoad>>();
  readonly #failed = new Map<string, string>();
  /** A 2×2×2 texture to bind to the LUT sampler when no LUT is used (a sampler must have one). */
  readonly placeholder3d: WebGLTexture;

  constructor(gl: WebGL2RenderingContext, resolver: MediaResolver) {
    this.#gl = gl;
    this.#resolver = resolver;
    this.placeholder3d = this.#upload3d({
      title: "",
      dimension: 3,
      size: 2,
      domainMin: [0, 0, 0],
      domainMax: [1, 1, 1],
      data: new Float32Array(2 * 2 * 2 * 3),
    });
  }

  /** Loads (and caches) a LUT so a later synchronous `lut()` finds it. Never throws. */
  prepare(lutId: string): Promise<LutLoad> {
    const ready = this.#luts.get(lutId);
    if (ready !== undefined) return Promise.resolve({ lut: ready.cube });
    const failed = this.#failed.get(lutId);
    if (failed !== undefined) return Promise.resolve({ lut: null, error: failed });
    let pending = this.#pending.get(lutId);
    if (pending === undefined) {
      pending = this.#load(lutId).finally(() => {
        this.#pending.delete(lutId);
      });
      this.#pending.set(lutId, pending);
    }
    return pending;
  }

  async #load(lutId: string): Promise<LutLoad> {
    const fail = (error: string): LutLoad => {
      this.#failed.set(lutId, error);
      return { lut: null, error };
    };
    try {
      let cube: CubeLut | undefined;
      if (isBuiltinLut(lutId)) {
        cube = builtinLut(lutId);
        if (cube === undefined) return fail(`There is no built-in LUT "${lutId}".`);
      } else {
        const response = await fetch(await this.#resolver.resolve(lutId, "lut"));
        if (!response.ok)
          return fail(`LUT "${lutId}" couldn't be downloaded (${String(response.status)}).`);
        cube = to3d(parseCube(await response.text()));
      }
      this.#luts.set(lutId, { texture: this.#upload3d(cube), cube });
      return { lut: cube };
    } catch (error) {
      return fail(
        error instanceof CubeError
          ? `LUT "${lutId}" isn't a valid .cube file: ${error.message}`
          : `LUT "${lutId}" couldn't be loaded: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  #upload3d(cube: CubeLut): WebGLTexture {
    const gl = this.#gl;
    const n = cube.size;
    const rgba = new Float32Array(n * n * n * 4);
    for (let i = 0; i < n * n * n; i++) {
      rgba[i * 4] = cube.data[i * 3] ?? 0;
      rgba[i * 4 + 1] = cube.data[i * 3 + 1] ?? 0;
      rgba[i * 4 + 2] = cube.data[i * 3 + 2] ?? 0;
      rgba[i * 4 + 3] = 1;
    }
    const texture = required(gl.createTexture(), "texture");
    gl.bindTexture(gl.TEXTURE_3D, texture);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA16F, n, n, n, 0, gl.RGBA, gl.FLOAT, rgba);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    for (const wrap of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) {
      gl.texParameteri(gl.TEXTURE_3D, wrap, gl.CLAMP_TO_EDGE);
    }
    return texture;
  }

  /** A prepared LUT's texture and data, or undefined. */
  lut(lutId: string): { texture: WebGLTexture; cube: CubeLut } | undefined {
    return this.#luts.get(lutId);
  }

  /** The 256×7 curves texture (and its data) for a grade's curves. */
  curves(color: ColorSettings): { texture: WebGLTexture; table: Float32Array } {
    const table = curveTable(color.curves);
    const key = Array.from(table.subarray(0, table.length), (v) => v.toFixed(5)).join(",");
    const cached = this.#curves.get(key);
    if (cached !== undefined) return { texture: cached, table };
    const gl = this.#gl;
    const texture = required(gl.createTexture(), "texture");
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R16F,
      CURVE_SIZE,
      CURVE_ROWS.length,
      0,
      gl.RED,
      gl.FLOAT,
      table,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (this.#curves.size >= 32) {
      const [oldest] = this.#curves.keys();
      const stale = oldest === undefined ? undefined : this.#curves.get(oldest);
      if (oldest !== undefined && stale !== undefined) {
        gl.deleteTexture(stale);
        this.#curves.delete(oldest);
      }
    }
    this.#curves.set(key, texture);
    return { texture, table };
  }

  dispose(): void {
    this.#gl.deleteTexture(this.placeholder3d);
    for (const texture of this.#curves.values()) this.#gl.deleteTexture(texture);
    for (const { texture } of this.#luts.values()) this.#gl.deleteTexture(texture);
    this.#curves.clear();
    this.#luts.clear();
  }
}
