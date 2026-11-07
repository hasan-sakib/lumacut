uniform float uAmount;
uniform float uFeature;
uniform int uMap;
uniform int uSeed;

void main() {
  vec2 p = pixelPos();
  vec2 q = p / uFeature;
  vec2 d;
  if (uMap == 0) d = vec2(vnoise(q, uSeed), vnoise(q + vec2(41.0, 17.0), uSeed)) - 0.5;
  else if (uMap == 1) d = vec2(sin(q.x * 6.2831853 + q.y * 1.7), cos(q.y * 6.2831853 + q.x * 1.3)) * 0.5;
  else d = contentUv() - 0.5;
  outColor = tapSrc(p + d * 2.0 * uAmount);
}
