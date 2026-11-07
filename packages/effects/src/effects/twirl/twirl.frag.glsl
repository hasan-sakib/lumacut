uniform float uAngle;
uniform float uRadius;
uniform vec2 uCenter;

void main() {
  vec2 p = pixelPos();
  vec2 c = fromContent(uCenter);
  vec2 d = p - c;
  float R = uRadius * 0.5 * min(contentSize().x, contentSize().y);
  float k = clamp(1.0 - length(d) / max(R, 1.0), 0.0, 1.0);
  outColor = tapSrc(c + rot2(uAngle * k * k) * d);
}
