uniform float uStrength;
uniform int uMode;
uniform bool uInvert;

float L(vec2 p) {
  return luma(straight(tapSrc(p)));
}

void main() {
  vec2 p = pixelPos();
  float tl = L(p + vec2(-1.0, -1.0)); float t = L(p + vec2(0.0, -1.0)); float tr = L(p + vec2(1.0, -1.0));
  float l = L(p + vec2(-1.0, 0.0));                                      float r = L(p + vec2(1.0, 0.0));
  float bl = L(p + vec2(-1.0, 1.0)); float b = L(p + vec2(0.0, 1.0)); float br = L(p + vec2(1.0, 1.0));
  float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
  float gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
  float e = clamp(length(vec2(gx, gy)) * uStrength, 0.0, 1.0);
  if (uInvert) e = 1.0 - e;
  vec4 c = here();
  if (uMode == 0) outColor = vec4(vec3(e) * c.a, c.a);
  else if (uMode == 1) outColor = vec4(c.rgb * (1.0 - e), c.a);
  else outColor = vec4(c.rgb * e, c.a);
}
