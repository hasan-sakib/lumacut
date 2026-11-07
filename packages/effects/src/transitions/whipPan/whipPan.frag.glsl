uniform float uBlur;
uniform float uSign;

void main() {
  vec2 uv = imageUv();
  float p = ease(uProgress);
  float len = uBlur * sin(3.14159265 * uProgress);
  vec4 acc = vec4(0.0);
  const int N = 20;
  for (int i = 0; i < N; i++) {
    float t = float(i) / float(N - 1) - 0.5;
    vec2 s = uv + vec2(t * len * uSign, 0.0);
    vec4 a = A(s - vec2(p * 1.2 * uSign, 0.0));
    vec4 b = B(s + vec2((1.0 - p) * 1.2 * uSign, 0.0));
    acc += uProgress < 0.5 ? a : b;
  }
  outColor = acc / float(N);
}
