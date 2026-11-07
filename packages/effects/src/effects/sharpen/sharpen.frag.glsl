uniform float uAmount;
uniform float uRadius;

void main() {
  vec2 p = pixelPos();
  float r = uRadius;
  vec4 c = tapSrc(p);
  vec4 blur = (tapSrc(p + vec2(-r, -r)) + 2.0 * tapSrc(p + vec2(0.0, -r)) + tapSrc(p + vec2(r, -r))
             + 2.0 * tapSrc(p + vec2(-r, 0.0)) + 4.0 * c + 2.0 * tapSrc(p + vec2(r, 0.0))
             + tapSrc(p + vec2(-r, r)) + 2.0 * tapSrc(p + vec2(0.0, r)) + tapSrc(p + vec2(r, r))) / 16.0;
  outColor = vec4(max(c.rgb + (c.rgb - blur.rgb) * uAmount, 0.0), c.a);
}
