uniform float uAmount;
uniform float uFeature;
uniform float uSpeed;
uniform int uSeed;

void main() {
  vec2 p = pixelPos();
  float t = float(uFrame) * uSpeed * 0.05;
  vec2 q = p / uFeature;
  vec2 d = vec2(vnoise(q + vec2(t, 0.0), uSeed), vnoise(q + vec2(0.0, t) + vec2(31.7, 11.3), uSeed + 1)) - 0.5;
  outColor = tapSrc(p + d * 2.0 * uAmount);
}
