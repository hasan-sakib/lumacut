// Adds a picture, scaled by a weight, onto what is already in the target (blending is additive).
uniform sampler2D uSrc;
uniform float uWeight;

void main() {
  outColor = texture(uSrc, vUv) * uWeight;
}
