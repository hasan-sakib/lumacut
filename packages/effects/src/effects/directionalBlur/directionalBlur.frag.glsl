uniform vec2 uDir;
uniform float uLength;

void main() {
  vec2 p = pixelPos();
  vec4 acc = vec4(0.0);
  const int N = 32;
  for (int i = 0; i <= N; i++) {
    float t = float(i) / float(N) - 0.5;
    acc += tapSrc(p + uDir * uLength * t);
  }
  outColor = acc / float(N + 1);
}
