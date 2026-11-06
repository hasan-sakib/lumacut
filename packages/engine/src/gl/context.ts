export interface GlCaps {
  maxTextureSize: number;
  /** GPU or software renderer name, for diagnostics. */
  renderer: string;
}

export class GlUnavailableError extends Error {
  override name = "GlUnavailableError";
}

/**
 * Creates the engine's WebGL2 context. The engine composites in RGBA16F, which needs
 * EXT_color_buffer_float; every browser that has WebCodecs also has both.
 */
export function createGl(canvas: OffscreenCanvas | HTMLCanvasElement): {
  gl: WebGL2RenderingContext;
  caps: GlCaps;
} {
  const options: WebGLContextAttributes = {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: "high-performance",
  };
  // Separate branches: TypeScript can't pick a getContext overload on the union type.
  const gl =
    canvas instanceof OffscreenCanvas
      ? canvas.getContext("webgl2", options)
      : canvas.getContext("webgl2", options);
  if (gl === null) {
    throw new GlUnavailableError(
      "WebGL2 is not available. Use a current Chrome or Edge with hardware acceleration enabled.",
    );
  }
  if (gl.getExtension("EXT_color_buffer_float") === null) {
    throw new GlUnavailableError(
      "This GPU can't render floating-point textures (EXT_color_buffer_float), which the " +
        "compositor needs.",
    );
  }
  const debug = gl.getExtension("WEBGL_debug_renderer_info");
  return {
    gl,
    caps: {
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
      renderer: debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : "unknown",
    },
  };
}
