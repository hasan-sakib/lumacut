// Multiplies the layer by a mask picture's alpha. The mask is an image (row 0 = top), the layer
// target is bottom-up, so the mask is read at the image-space coordinate.
uniform sampler2D uSrc;
uniform sampler2D uMask;

void main() {
  vec4 c = texture(uSrc, vUv);
  float m = texture(uMask, imageUv()).a;
  outColor = c * m;
}
