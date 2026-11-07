// One direction of a Gaussian blur (run twice: horizontal, then vertical).
uniform vec2 uDir;       // (1, 0) or (0, 1)
uniform float uSigma;    // standard deviation in target pixels

void main() {
  if (uSigma <= 0.01) {
    outColor = here();
    return;
  }
  const int N = 16;
  float stride = max(1.0, uSigma * 3.0 / float(N));
  vec2 p = pixelPos();
  vec4 acc = vec4(0.0);
  float wsum = 0.0;
  for (int i = -N; i <= N; i++) {
    float d = float(i) * stride;
    float w = exp(-0.5 * d * d / (uSigma * uSigma));
    acc += w * tapSrc(p + uDir * d);
    wsum += w;
  }
  outColor = acc / wsum;
}
