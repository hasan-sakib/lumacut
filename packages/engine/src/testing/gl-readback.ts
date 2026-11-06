import { required } from "../gl/util.ts";
import { decodeBarcodeRow, barcodeStripHeight } from "./barcode.ts";

/** Reads a whole RGBA8 texture; the result is bottom-left origin (`readPixels` order). */
export function readTexturePixels(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
  width: number,
  height: number,
): Uint8Array {
  const fbo = required(gl.createFramebuffer(), "framebuffer");
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(fbo);
  return pixels;
}

/** Frame number burned into a texture holding an upright barcode frame (reads one row only). */
export function readTextureBarcode(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
  width: number,
  height: number,
): number | null {
  const fbo = required(gl.createFramebuffer(), "framebuffer");
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  // Texture row 0 is the image top, so the barcode row sits at height - strip/2 counted from it.
  const row = new Uint8Array(width * 4);
  gl.readPixels(
    0,
    height - barcodeStripHeight(height) / 2,
    width,
    1,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    row,
  );
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(fbo);
  return decodeBarcodeRow(width, (x) => row[x * 4] ?? 0);
}
