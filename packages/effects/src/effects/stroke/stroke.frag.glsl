uniform vec4 uColor;
uniform float uWidth;
uniform float uOpacity;
uniform int uPos;

void main() {
  vec4 o = here();
  vec2 p = pixelPos();
  float maxA = o.a;
  float minA = o.a;
  const int RINGS = 4;
  const int DIRS = 24;
  for (int r = 1; r <= RINGS; r++) {
    float rad = uWidth * float(r) / float(RINGS);
    for (int i = 0; i < DIRS; i++) {
      float a = 6.2831853 * float(i) / float(DIRS);
      float s = tapSrc(p + vec2(cos(a), sin(a)) * rad).a;
      maxA = max(maxA, s);
      minA = min(minA, s);
    }
  }
  float kOut = (uPos == 1 ? 0.0 : maxA * (1.0 - o.a)) * uColor.a * uOpacity;
  float kIn = (uPos == 0 ? 0.0 : o.a * (1.0 - minA)) * uColor.a * uOpacity;
  vec3 rgb = o.rgb * (1.0 - kIn) + uColor.rgb * kIn * o.a;
  rgb += uColor.rgb * kOut;
  outColor = vec4(rgb, o.a + kOut);
}
