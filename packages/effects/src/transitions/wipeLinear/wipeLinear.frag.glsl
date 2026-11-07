uniform vec2 uDir;
uniform float uSoftness;

void main() {
  vec2 uv = imageUv();
  float t = dot(uv - 0.5, uDir) / (abs(uDir.x) + abs(uDir.y)) + 0.5;
  float soft = max(uSoftness, 0.001);
  float edge = mix(-soft, 1.0, ease(uProgress));
  float m = smoothstep(edge, edge + soft, t);
  outColor = mix(B(uv), A(uv), m);
}
