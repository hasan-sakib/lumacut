uniform vec3 uDark;
uniform vec3 uLight;
uniform float uAmount;

void main() {
  vec4 c = here();
  vec3 s = straight(c);
  float l = luma(clamp(toSrgb(s), 0.0, 1.0));
  vec3 mapped = mix(uDark, uLight, l);
  outColor = vec4(mix(s, mapped, uAmount) * c.a, c.a);
}
