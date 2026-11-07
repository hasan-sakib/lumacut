uniform int uKind;
uniform int uBlend;
uniform vec4 uColorA;
uniform vec4 uColorB;
uniform vec2 uAxis;
uniform float uOpacity;

void main() {
  vec4 c = hereOrig();
  vec2 uv = contentUv();
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) {
    outColor = c;
    return;
  }
  vec2 cs = contentSize();
  vec2 q = (uv - 0.5) * cs;
  float t;
  if (uKind == 0) t = clamp(dot(q, uAxis) / length(cs) + 0.5, 0.0, 1.0);
  else t = clamp(length(q) / (0.5 * length(cs)), 0.0, 1.0);
  vec4 g = mix(uColorA, uColorB, t);
  vec3 base = straight(c);
  vec3 mixed = g.rgb;
  if (uBlend == 2) mixed = base * g.rgb;
  else if (uBlend == 3) mixed = vec3(1.0) - (vec3(1.0) - base) * (vec3(1.0) - g.rgb);
  float k = uOpacity * g.a;
  vec3 res = mix(base, mixed, k);
  float a = (uBlend == 2 || uBlend == 3) ? c.a : max(c.a, k);
  outColor = vec4(res * a, a);
}
