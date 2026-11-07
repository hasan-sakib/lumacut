uniform vec2 uNormal;
uniform vec2 uCenter;

void main() {
  vec2 p = pixelPos();
  float s = dot(p - fromContent(uCenter), uNormal);
  outColor = tapSrc(s < 0.0 ? p - 2.0 * s * uNormal : p);
}
