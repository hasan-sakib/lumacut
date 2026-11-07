uniform float uSegments;
uniform float uAngle;
uniform vec2 uCenter;

void main() {
  vec2 p = pixelPos();
  vec2 c = fromContent(uCenter);
  vec2 d = p - c;
  float seg = 6.2831853 / uSegments;
  float a = mod(atan(d.y, d.x) - uAngle, seg);
  a = abs(a - seg * 0.5) + uAngle;
  outColor = tapSrc(c + vec2(cos(a), sin(a)) * length(d));
}
