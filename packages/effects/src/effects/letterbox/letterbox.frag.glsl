uniform float uAspect;
uniform vec4 uColor;
uniform float uOpacity;

void main() {
  vec4 c = here();
  vec2 uv = contentUv();
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) {
    outColor = c;
    return;
  }
  vec2 cs = contentSize();
  float have = cs.x / cs.y;
  float bar = 0.0;
  if (uAspect > have) {
    float edge = (1.0 - have / uAspect) * 0.5;
    bar = (uv.y < edge || uv.y > 1.0 - edge) ? 1.0 : 0.0;
  } else {
    float edge = (1.0 - uAspect / have) * 0.5;
    bar = (uv.x < edge || uv.x > 1.0 - edge) ? 1.0 : 0.0;
  }
  float a = bar * uColor.a * uOpacity;
  outColor = vec4(c.rgb * (1.0 - a) + uColor.rgb * a, c.a * (1.0 - a) + a);
}
