uniform float uLevel;
uniform float uSoftness;

void main() {
  vec4 c = here();
  float l = luma(clamp(toSrgb(straight(c)), 0.0, 1.0));
  float k = smoothstep(uLevel - uSoftness, uLevel + max(uSoftness, 0.001), l);
  outColor = vec4(vec3(k) * c.a, c.a);
}
