uniform vec4 uColor;
uniform float uOpacity;
uniform vec2 uOffset;

void main() {
  vec4 o = hereOrig();
  float sh = tapSrc(pixelPos() - uOffset).a * uColor.a * uOpacity;
  outColor = vec4(o.rgb + uColor.rgb * sh * (1.0 - o.a), o.a + sh * (1.0 - o.a));
}
