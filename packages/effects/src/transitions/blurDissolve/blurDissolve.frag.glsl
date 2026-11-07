uniform float uAmount;

void main() {
  vec2 uv = imageUv();
  float p = ease(uProgress);
  float r = uAmount * sin(3.14159265 * uProgress);
  vec4 a = vec4(0.0);
  vec4 b = vec4(0.0);
  const int N = 24;
  for (int i = 0; i < N; i++) {
    float rad = sqrt((float(i) + 0.5) / float(N));
    float ang = float(i) * 2.39996323;
    vec2 off = vec2(cos(ang), sin(ang)) * rad * r * vec2(uSize.y / uSize.x, 1.0);
    a += A(uv + off);
    b += B(uv + off);
  }
  outColor = mix(a / float(N), b / float(N), p);
}
