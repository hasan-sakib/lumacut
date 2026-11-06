import type { EngineStats } from "../stats.ts";
import { required } from "./util.ts";

const BYTES_PER_PIXEL = 8; // RGBA16F

/** An RGBA16F texture with a framebuffer: linear, premultiplied, bottom-up storage. */
export interface Target {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  width: number;
  height: number;
}

export function createTexture16F(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
): WebGLTexture {
  const texture = required(gl.createTexture(), "texture");
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, width, height);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

/** Recycles accumulation buffers by size so a frame never allocates GPU memory in steady state. */
export class TargetPool {
  readonly #gl: WebGL2RenderingContext;
  readonly #stats: EngineStats;
  readonly #free = new Map<string, Target[]>();

  constructor(gl: WebGL2RenderingContext, stats: EngineStats) {
    this.#gl = gl;
    this.#stats = stats;
  }

  acquire(width: number, height: number): Target {
    const key = `${String(width)}x${String(height)}`;
    const reused = this.#free.get(key)?.pop();
    if (reused !== undefined) return reused;
    const gl = this.#gl;
    const texture = createTexture16F(gl, width, height);
    const framebuffer = required(gl.createFramebuffer(), "framebuffer");
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`Can't render at ${key}: the GPU rejected a float framebuffer of that size`);
    }
    this.#stats.targetCount += 1;
    this.#stats.targetBytes += width * height * BYTES_PER_PIXEL;
    return { texture, framebuffer, width, height };
  }

  release(target: Target): void {
    const key = `${String(target.width)}x${String(target.height)}`;
    const list = this.#free.get(key) ?? [];
    list.push(target);
    this.#free.set(key, list);
  }

  dispose(): void {
    for (const list of this.#free.values()) {
      for (const target of list) {
        this.#gl.deleteFramebuffer(target.framebuffer);
        this.#gl.deleteTexture(target.texture);
        this.#stats.targetCount -= 1;
        this.#stats.targetBytes -= target.width * target.height * BYTES_PER_PIXEL;
      }
    }
    this.#free.clear();
  }
}
