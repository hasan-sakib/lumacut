/** Uploading decoded media into cache textures. Rows are top-down: texel row 0 is the image top. */
export type UploadSource = VideoFrame | ImageBitmap | OffscreenCanvas | HTMLCanvasElement;

export function uploadSource(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
  source: UploadSource,
  reused: boolean,
): void {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  // Bitmaps are decoded premultiplied; video is opaque. Never let the browser re-premultiply.
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  if (reused) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
}
