// Adds the blurred bright parts (`uSrc`) back onto the effect's input (`uOrig`).
uniform float uIntensity;
uniform vec3 uTint;

void main() {
  vec4 o = hereOrig();
  vec4 g = here();
  float a = min(1.0, o.a + g.a * uIntensity * (1.0 - o.a));
  outColor = vec4(o.rgb + g.rgb * uTint * uIntensity, a);
}
