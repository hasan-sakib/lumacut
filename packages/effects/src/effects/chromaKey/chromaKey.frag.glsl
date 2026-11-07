uniform vec3 uKey;
uniform float uTolerance;
uniform float uSoftness;
uniform float uSpill;

vec2 chroma(vec3 e) {
  float y = luma(e);
  return vec2((e.b - y) / 1.8556, (e.r - y) / 1.5748);
}

void main() {
  vec4 c = here();
  vec3 e = clamp(toSrgb(straight(c)), 0.0, 1.0);
  vec3 k = toSrgb(uKey);
  float dist = length(chroma(e) - chroma(k));
  float keep = smoothstep(uTolerance, uTolerance + max(uSoftness, 0.001), dist);
  vec3 d = e;
  if (k.g >= k.r && k.g >= k.b) d.g = mix(e.g, min(e.g, max(e.r, e.b)), uSpill);
  else if (k.b >= k.r && k.b >= k.g) d.b = mix(e.b, min(e.b, max(e.r, e.g)), uSpill);
  else d.r = mix(e.r, min(e.r, max(e.g, e.b)), uSpill);
  float a = c.a * keep;
  outColor = vec4(toLinear(d) * a, a);
}
