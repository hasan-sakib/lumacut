uniform float uAmount;

void main() {
  vec4 c = here();
  vec3 e = clamp(toSrgb(straight(c)), 0.0, 1.0);
  vec3 inv = toLinear(1.0 - e) * c.a;
  outColor = vec4(mix(c.rgb, inv, uAmount), c.a);
}
