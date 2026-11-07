uniform float uLevels;

void main() {
  vec4 c = here();
  vec3 e = clamp(toSrgb(straight(c)), 0.0, 1.0);
  e = floor(e * (uLevels - 1.0) + 0.5) / (uLevels - 1.0);
  outColor = vec4(toLinear(e) * c.a, c.a);
}
