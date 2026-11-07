uniform float uAngle;
uniform float uZoom;

void main() {
  vec2 uv = imageUv();
  float p = ease(uProgress);
  vec2 asp = vec2(uSize.x / uSize.y, 1.0);
  vec2 q = (uv - 0.5) * asp;
  vec2 qa = rot2(-uAngle * p) * q / (1.0 + uZoom * p);
  vec2 qb = rot2(uAngle * (1.0 - p)) * q / (1.0 + uZoom * (1.0 - p));
  outColor = mix(A(qa / asp + 0.5), B(qb / asp + 0.5), p);
}
