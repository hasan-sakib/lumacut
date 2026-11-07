uniform float uStrength;
uniform vec2 uCenter;

void main() {
  vec2 p = pixelPos();
  vec2 c = fromContent(uCenter);
  float R = 0.5 * min(contentSize().x, contentSize().y);
  vec2 d = (p - c) / R;
  outColor = tapSrc(c + d * (1.0 - 0.9 * uStrength * dot(d, d)) * R);
}
