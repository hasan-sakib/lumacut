uniform vec4 uColor;
uniform float uOpacity;

void main() {
  vec4 c = here();
  vec3 rgb = mix(c.rgb, uColor.rgb * c.a, uOpacity * uColor.a);
  outColor = vec4(rgb, c.a);
}
