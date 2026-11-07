uniform int uDirection;
vec2 moveDir(int d) {
  if (d == 0) return vec2(-1.0, 0.0);
  if (d == 1) return vec2(1.0, 0.0);
  if (d == 2) return vec2(0.0, -1.0);
  return vec2(0.0, 1.0);
}

void main() {
  vec2 uv = imageUv();
  vec2 d = moveDir(uDirection);
  float p = ease(uProgress);
  vec4 b = B(uv - d * (p - 1.0));
  outColor = b + A(uv) * (1.0 - b.a);
}
