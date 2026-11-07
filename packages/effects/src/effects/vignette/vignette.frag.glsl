uniform float uAmount;
uniform float uSize;
uniform float uSoftness;
uniform float uRoundness;

void main() {
  vec4 c = here();
  vec2 cs = contentSize();
  float aspect = cs.x / cs.y;
  vec2 q = (contentUv() - 0.5) * 2.0;
  q.x *= mix(1.0, aspect, uRoundness);
  float d = length(q) / 1.41421356;
  float m = smoothstep(uSize, uSize + max(uSoftness, 0.001), d);
  vec3 rgb = c.rgb;
  if (uAmount >= 0.0) rgb *= 1.0 - uAmount * m;
  else rgb = mix(rgb, vec3(c.a), -uAmount * m);
  outColor = vec4(rgb, c.a);
}
