// Keeps only what is brighter than the threshold (for glow and flares).
uniform float uThreshold;

void main() {
  vec4 c = here();
  float l = luma(straight(c));
  float k = clamp((l - uThreshold) / max(1.0 - uThreshold, 0.001), 0.0, 1.0);
  outColor = c * k;
}
