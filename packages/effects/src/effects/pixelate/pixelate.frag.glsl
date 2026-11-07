uniform float uCell;

void main() {
  vec2 p = pixelPos() - vec2(uPad);
  vec2 q = (floor(p / uCell) + 0.5) * uCell + vec2(uPad);
  outColor = tapSrc(q);
}
