uniform vec4 uColor;
uniform float uIntensity;
uniform float uOpacity;

void main() {
  vec4 o = hereOrig();
  float g = clamp(here().a * uIntensity, 0.0, 1.0) * uColor.a * uOpacity;
  outColor = vec4(o.rgb * (1.0 - g) + uColor.rgb * g * o.a, o.a);
}
