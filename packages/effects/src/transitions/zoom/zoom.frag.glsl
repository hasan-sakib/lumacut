uniform float uStrength;
uniform vec2 uCenter;

void main() {
  vec2 uv = imageUv();
  float p = ease(uProgress);
  vec2 ua = uCenter + (uv - uCenter) / (1.0 + uStrength * p);
  vec2 ub = uCenter + (uv - uCenter) * (1.0 + uStrength * (1.0 - p));
  outColor = mix(A(ua), B(ub), p);
}
