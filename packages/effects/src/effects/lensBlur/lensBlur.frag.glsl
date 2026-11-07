uniform float uRadius;
uniform float uBoost;

void main() {
  vec2 p = pixelPos();
  vec4 acc = vec4(0.0);
  float wsum = 0.0;
  const int N = 48;
  for (int i = 0; i < N; i++) {
    float r = sqrt((float(i) + 0.5) / float(N));
    float a = float(i) * 2.39996323;
    vec4 s = tapSrc(p + vec2(cos(a), sin(a)) * r * uRadius);
    float w = 1.0 + uBoost * 4.0 * pow(luma(straight(s)), 4.0);
    acc += s * w;
    wsum += w;
  }
  outColor = acc / wsum;
}
