uniform float uAmplitude;
uniform float uWavelength;
uniform float uPhase;
uniform vec2 uAxis;

void main() {
  vec2 p = pixelPos();
  vec2 n = vec2(-uAxis.y, uAxis.x);
  float w = sin(6.2831853 * dot(p, uAxis) / uWavelength + uPhase) * uAmplitude;
  outColor = tapSrc(p + n * w);
}
