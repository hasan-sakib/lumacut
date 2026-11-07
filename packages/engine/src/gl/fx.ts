import type { EngineStats } from "../stats.ts";
import commonSource from "./shaders/fx-common.glsl?raw";
import vertexSource from "./shaders/fx.vert.glsl?raw";
import { createProgram } from "./program.ts";
import type { Target } from "./targets.ts";
import { required } from "./util.ts";

const HEADER = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp sampler3D;
`;

/** A complete effect fragment shader: header, the shared functions, then the effect's own code. */
export function fxShader(body: string): string {
  return `${HEADER}${commonSource}\n${body}`;
}

/** A float, a bool (as int), an `{ int }`, a vec2/3/4 as an array, or `{ v3 }` / `{ v2 }` arrays of vectors. */
export type UniformValue =
  | number
  | boolean
  | readonly [number, number]
  | readonly [number, number, number]
  | readonly [number, number, number, number]
  | { int: number }
  | { v2: readonly number[] }
  | { v3: readonly number[] };

export interface FxInput {
  name: string;
  texture: WebGLTexture;
  kind?: "2d" | "3d";
}

export interface FxPass {
  program: WebGLProgram;
  destination: Target;
  inputs: readonly FxInput[];
  uniforms: Readonly<Record<string, UniformValue>>;
}

/** Runs full-screen shader passes between render targets. Programs are compiled once per name. */
export class FxRunner {
  readonly #gl: WebGL2RenderingContext;
  readonly #stats: EngineStats;
  readonly #programs = new Map<string, WebGLProgram>();
  readonly #locations = new WeakMap<WebGLProgram, Map<string, WebGLUniformLocation | null>>();
  readonly #vao: WebGLVertexArrayObject;

  constructor(gl: WebGL2RenderingContext, stats: EngineStats) {
    this.#gl = gl;
    this.#stats = stats;
    this.#vao = required(gl.createVertexArray(), "vertex array");
  }

  /** Compiles `fragmentBody` (with the shared header) once under `name`. */
  program(name: string, fragmentBody: string): WebGLProgram {
    const cached = this.#programs.get(name);
    if (cached !== undefined) return cached;
    const program = createProgram(this.#gl, name, vertexSource, fxShader(fragmentBody));
    this.#programs.set(name, program);
    return program;
  }

  #location(program: WebGLProgram, name: string): WebGLUniformLocation | null {
    let map = this.#locations.get(program);
    if (map === undefined) {
      map = new Map();
      this.#locations.set(program, map);
    }
    if (!map.has(name)) map.set(name, this.#gl.getUniformLocation(program, name));
    return map.get(name) ?? null;
  }

  run(pass: FxPass, frame: number): void {
    const gl = this.#gl;
    const { destination } = pass;
    gl.bindFramebuffer(gl.FRAMEBUFFER, destination.framebuffer);
    gl.viewport(0, 0, destination.width, destination.height);
    gl.disable(gl.BLEND);
    gl.useProgram(pass.program);
    gl.bindVertexArray(this.#vao);

    pass.inputs.forEach((input, unit) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(input.kind === "3d" ? gl.TEXTURE_3D : gl.TEXTURE_2D, input.texture);
      gl.uniform1i(this.#location(pass.program, input.name), unit);
    });
    gl.uniform2f(this.#location(pass.program, "uSize"), destination.width, destination.height);
    gl.uniform1i(this.#location(pass.program, "uFrame"), frame);

    for (const [name, value] of Object.entries(pass.uniforms)) {
      const location = this.#location(pass.program, name);
      if (location === null) continue; // the compiler dropped an unused uniform
      if (typeof value === "number") gl.uniform1f(location, value);
      else if (typeof value === "boolean") gl.uniform1i(location, value ? 1 : 0);
      else if (Array.isArray(value)) {
        const v = value as readonly number[];
        if (v.length === 2) gl.uniform2f(location, v[0] ?? 0, v[1] ?? 0);
        else if (v.length === 3) gl.uniform3f(location, v[0] ?? 0, v[1] ?? 0, v[2] ?? 0);
        else gl.uniform4f(location, v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, v[3] ?? 0);
      } else if ("int" in (value as object)) gl.uniform1i(location, (value as { int: number }).int);
      else if ("v3" in (value as object)) gl.uniform3fv(location, (value as { v3: number[] }).v3);
      else gl.uniform2fv(location, (value as { v2: number[] }).v2);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    this.#stats.fxPasses += 1;
  }
}
