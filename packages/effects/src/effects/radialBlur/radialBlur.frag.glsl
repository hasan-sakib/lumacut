uniform vec2 uCenter;
uniform float uAngle;

void main() {
  vec2 p = pixelPos();
  vec2 c = fromContent(uCenter);
  vec4 acc = vec4(0.0);
  const int N = 32;
  for (int i = 0; i < N; i++) {
    float t = float(i) / float(N - 1) - 0.5;
    acc += tapSrc(c + rot2(uAngle * t) * (p - c));
  }
  outColor = acc / float(N);
}
