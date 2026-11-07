uniform float uCell;
uniform float uLine;
uniform vec4 uColor;
uniform float uOpacity;
uniform vec2 uOffset;

void main() {
  vec4 c = here();
  vec2 uv = contentUv();
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) {
    outColor = c;
    return;
  }
  vec2 p = pixelPos() - vec2(uPad) - uOffset;
  vec2 f = mod(p, uCell);
  vec2 d = min(f, uCell - f);
  float line = 1.0 - smoothstep(uLine * 0.5 - 0.5, uLine * 0.5 + 0.5, min(d.x, d.y));
  float a = line * uColor.a * uOpacity;
  outColor = vec4(c.rgb * (1.0 - a) + uColor.rgb * a, c.a * (1.0 - a) + a);
}
