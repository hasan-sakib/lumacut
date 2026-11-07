uniform float uThreshold;
uniform float uSoftness;
uniform int uMode;
uniform bool uInvert;

void main() {
  vec4 c = here();
  float l = luma(clamp(toSrgb(straight(c)), 0.0, 1.0));
  float soft = max(uSoftness, 0.001);
  float k = uMode == 0 ? smoothstep(uThreshold, uThreshold + soft, l)
                       : 1.0 - smoothstep(uThreshold - soft, uThreshold, l);
  if (uInvert) k = 1.0 - k;
  outColor = c * k;
}
