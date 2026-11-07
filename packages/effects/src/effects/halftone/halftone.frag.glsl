uniform float uCell;
uniform float uAngle;
uniform float uContrast;
uniform int uStyle;

void main() {
  vec2 p = pixelPos();
  mat2 R = rot2(uAngle);
  vec2 q = R * p / uCell;
  vec2 cell = floor(q) + 0.5;
  vec4 s = tapSrc(transpose(R) * (cell * uCell));
  vec3 rgb = straight(s);
  float l = clamp((luma(toSrgb(rgb)) - 0.5) * uContrast + 0.5, 0.0, 1.0);
  float radius = sqrt(1.0 - l) * 0.72;
  float aa = 1.5 / uCell;
  float dotMask = 1.0 - smoothstep(radius - aa, radius + aa, length(q - cell));
  vec3 ink = uStyle == 0 ? vec3(0.0) : rgb;
  float a = tapSrc(p).a;
  outColor = vec4(mix(vec3(1.0), ink, dotMask) * a, a);
}
