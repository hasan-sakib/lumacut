import { required } from "./util.ts";

export class ShaderError extends Error {
  override name = "ShaderError";
}

function compile(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
  name: string,
): WebGLShader {
  const shader = required(gl.createShader(type), "shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) !== true) {
    const log = gl.getShaderInfoLog(shader) ?? "(no log)";
    gl.deleteShader(shader);
    const numbered = source
      .split("\n")
      .map((line, i) => `${String(i + 1).padStart(4)}| ${line}`)
      .join("\n");
    throw new ShaderError(`Shader "${name}" failed to compile:\n${log}\n${numbered}`);
  }
  return shader;
}

export function createProgram(
  gl: WebGL2RenderingContext,
  name: string,
  vertexSource: string,
  fragmentSource: string,
): WebGLProgram {
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource, `${name}.vert`);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource, `${name}.frag`);
  const program = required(gl.createProgram(), "shader program");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true) {
    const log = gl.getProgramInfoLog(program) ?? "(no log)";
    gl.deleteProgram(program);
    throw new ShaderError(`Program "${name}" failed to link:\n${log}`);
  }
  return program;
}

export type Uniforms<K extends string> = Record<K, WebGLUniformLocation | null>;

export function uniformLocations<K extends string>(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  names: readonly K[],
): Uniforms<K> {
  const out = {} as Uniforms<K>;
  for (const name of names) out[name] = gl.getUniformLocation(program, name);
  return out;
}
