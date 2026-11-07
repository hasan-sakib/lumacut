uniform vec2 uCenter;
uniform float uAmount;

void main() {
  vec2 p = pixelPos();
  vec2 c = fromContent(uCenter);
  vec4 acc = vec4(0.0);
  const int N = 32;
  for (int i = 0; i < N; i++) {
    float t = float(i) / float(N - 1);
    acc += tapSrc(c + (p - c) * (1.0 - uAmount * t));
  }
  outColor = acc / float(N);
}
