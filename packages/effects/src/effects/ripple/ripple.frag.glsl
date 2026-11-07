uniform float uAmount;
uniform float uWavelength;
uniform float uPhase;
uniform vec2 uCenter;

void main() {
  vec2 p = pixelPos();
  vec2 d = p - fromContent(uCenter);
  float r = length(d);
  vec2 dir = r > 0.0 ? d / r : vec2(0.0);
  float falloff = 1.0 / (1.0 + r / (uWavelength * 6.0));
  float w = sin(6.2831853 * r / uWavelength - uPhase) * uAmount * falloff;
  outColor = tapSrc(p + dir * w);
}
