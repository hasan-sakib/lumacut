uniform float uSpacing;
uniform float uIntensity;
uniform float uThickness;
uniform float uRoll;

void main() {
  vec4 c = here();
  float y = pixelPos().y - uPad + float(uFrame) * uRoll;
  float f = mod(y, uSpacing) / uSpacing;
  float band = 1.0 - smoothstep(uThickness * 0.8, uThickness, f);
  outColor = vec4(c.rgb * (1.0 - band * uIntensity), c.a);
}
