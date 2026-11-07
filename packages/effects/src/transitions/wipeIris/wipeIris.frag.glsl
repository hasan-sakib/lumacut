uniform int uShape;
uniform vec2 uCenter;
uniform float uSoftness;

void main() {
  vec2 uv = imageUv();
  vec2 q = (uv - uCenter) * vec2(uSize.x / uSize.y, 1.0);
  float d;
  if (uShape == 0) d = length(q);
  else if (uShape == 1) d = abs(q.x) + abs(q.y);
  else d = max(abs(q.x), abs(q.y));
  float maxD = (uShape == 1 ? 1.6 : 1.2) * max(uSize.x / uSize.y, 1.0);
  float soft = max(uSoftness, 0.001);
  float radius = ease(uProgress) * (maxD + soft);
  float m = smoothstep(radius - soft, radius, d);
  outColor = mix(B(uv), A(uv), m);
}
