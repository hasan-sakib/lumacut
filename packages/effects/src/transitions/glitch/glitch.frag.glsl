uniform float uIntensity;
uniform float uSlices;
uniform int uSeed;

void main() {
  vec2 uv = imageUv();
  float row = floor(uv.y * uSlices);
  float rnd = noise(vec2(row, 3.0), uFrame / 2, uSeed);
  float burst = sin(3.14159265 * uProgress);
  float shift = (rnd - 0.5) * 0.25 * uIntensity * burst * step(0.5, noise(vec2(row, 9.0), uFrame / 3, uSeed + 7));
  vec2 s = vec2(uv.x + shift, uv.y);
  float cut = noise(vec2(row, 5.0), uSeed, uSeed + 3);
  bool toB = cut < uProgress * 1.15 - 0.075;
  vec2 split = vec2(0.012 * uIntensity * burst, 0.0);
  vec4 r = toB ? B(s + split) : A(s + split);
  vec4 g = toB ? B(s) : A(s);
  vec4 b = toB ? B(s - split) : A(s - split);
  outColor = vec4(r.r, g.g, b.b, max(max(r.a, g.a), b.a));
}
