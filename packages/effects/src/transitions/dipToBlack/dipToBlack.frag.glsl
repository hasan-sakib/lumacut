uniform vec4 uColor;
uniform float uHold;

void main() {
  vec2 uv = imageUv();
  float half_ = (1.0 - uHold) * 0.5;
  vec4 c = vec4(uColor.rgb * uColor.a, uColor.a);
  if (uProgress < half_) outColor = mix(A(uv), c, ease(uProgress / max(half_, 0.001)));
  else if (uProgress > 1.0 - half_) outColor = mix(c, B(uv), ease((uProgress - (1.0 - half_)) / max(half_, 0.001)));
  else outColor = c;
}
