uniform float uAmount;
uniform int uMode;
uniform vec2 uAxis;
uniform vec2 uCenter;

void main() {
  vec2 p = pixelPos();
  vec2 off;
  if (uMode == 0) {
    vec2 d = p - fromContent(uCenter);
    float r = length(d) / max(length(contentSize()) * 0.5, 1.0);
    off = normalize(d + vec2(1e-5)) * uAmount * r;
  } else {
    off = uAxis * uAmount;
  }
  vec4 r = tapSrc(p + off);
  vec4 g = tapSrc(p);
  vec4 b = tapSrc(p - off);
  outColor = vec4(r.r, g.g, b.b, max(max(r.a, g.a), b.a));
}
