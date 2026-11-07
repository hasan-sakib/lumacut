uniform float uIntensity;
uniform float uSpeed;
uniform int uSeed;
uniform vec4 uColorA;
uniform vec4 uColorB;

void main() {
  vec4 c = here();
  vec2 uv = contentUv();
  float t = float(uFrame) * uSpeed * 0.02;
  float s = float(uSeed) * 1.7;
  float d1 = length(uv - vec2(0.15 + 0.25 * sin(t + s), 0.2 + 0.2 * cos(t * 0.7 + s)));
  float d2 = length(uv - vec2(0.85 + 0.15 * cos(t * 0.9 + s * 2.0), 0.8 + 0.2 * sin(t * 0.6 + s)));
  float d3 = abs(uv.x - 0.5 - 0.4 * sin(t * 0.5 + s));
  float b1 = exp(-d1 * d1 * 5.0);
  float b2 = exp(-d2 * d2 * 4.0);
  float b3 = exp(-d3 * d3 * 18.0) * 0.5;
  vec3 leak = uColorA.rgb * b1 + uColorB.rgb * b2 + mix(uColorA.rgb, uColorB.rgb, 0.5) * b3;
  vec3 screen = vec3(1.0) - (vec3(1.0) - c.rgb) * (vec3(1.0) - leak * uIntensity * c.a);
  outColor = vec4(screen, c.a);
}
