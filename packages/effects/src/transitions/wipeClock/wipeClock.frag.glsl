uniform float uStart;
uniform float uSoftness;
uniform bool uClockwise;

void main() {
  vec2 uv = imageUv();
  vec2 q = (uv - 0.5) * vec2(uSize.x / uSize.y, 1.0);
  float a = atan(q.y, q.x) - uStart;
  float t = fract(a / 6.2831853 + 1.0);
  if (!uClockwise) t = 1.0 - t;
  float soft = max(uSoftness, 0.001);
  float edge = mix(-soft, 1.0, uProgress);
  float m = smoothstep(edge, edge + soft, t);
  outColor = mix(B(uv), A(uv), m);
}
