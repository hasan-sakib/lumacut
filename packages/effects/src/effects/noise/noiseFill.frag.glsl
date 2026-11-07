uniform float uFeature;
uniform float uAmount;
uniform float uSpeed;
uniform bool uColorful;
uniform int uSeed;
uniform int uBlend;

void main() {
  vec4 c = hereOrig();
  vec2 uv = contentUv();
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) {
    outColor = c;
    return;
  }
  vec2 q = pixelPos() / uFeature;
  float t = float(uFrame) * uSpeed * 0.05;
  float n = vnoise(q + vec2(t * 3.1, t * 1.7), uSeed) * 0.6
          + vnoise(q * 2.0 + vec2(7.0, 3.0) + vec2(t * 2.0), uSeed + 1) * 0.3
          + vnoise(q * 4.0, uSeed + 2) * 0.1;
  vec3 v = uColorful ? vec3(n, vnoise(q + vec2(13.0, 5.0) + vec2(t), uSeed + 3), vnoise(q + vec2(29.0, 41.0) - vec2(t), uSeed + 4)) : vec3(n);
  vec3 base = straight(c);
  vec3 res = uBlend == 0 ? mix(base, toLinear(v), uAmount) : base + (toLinear(v) - 0.5) * uAmount;
  float a = uBlend == 0 ? max(c.a, uAmount) : c.a;
  outColor = vec4(max(res, 0.0) * a, a);
}
