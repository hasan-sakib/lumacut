uniform float uAmount;

void main() {
  vec4 c = here();
  vec3 e = clamp(toSrgb(straight(c)), 0.0, 1.0);
  float l = luma(e);
  vec3 tint = mix(vec3(0.0, 0.5, 0.55), vec3(1.0, 0.62, 0.3), smoothstep(0.15, 0.85, l));
  vec3 toned = e + (tint - vec3(luma(tint))) * 0.5;
  toned = (toned - 0.5) * 1.1 + 0.5;
  outColor = vec4(toLinear(clamp(mix(e, toned, uAmount), 0.0, 1.0)) * c.a, c.a);
}
