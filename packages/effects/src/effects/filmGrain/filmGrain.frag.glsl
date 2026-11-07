uniform float uAmount;
uniform float uGrain;
uniform bool uColored;
uniform int uSeed;

void main() {
  vec4 c = here();
  vec3 s = straight(c);
  vec2 cell = floor(pixelPos() / uGrain);
  float n0 = (noise(cell, uFrame, uSeed) + noise(cell + vec2(17.0, 3.0), uFrame, uSeed)
            + noise(cell + vec2(5.0, 29.0), uFrame, uSeed)) / 3.0 - 0.5;
  vec3 n = vec3(n0);
  if (uColored) {
    n = vec3(noise(cell, uFrame, uSeed) - 0.5, noise(cell + vec2(3.0, 5.0), uFrame, uSeed + 1) - 0.5,
             noise(cell + vec2(11.0, 2.0), uFrame, uSeed + 2) - 0.5);
  }
  float mid = 1.0 - abs(2.0 * luma(s) - 1.0) * 0.6;
  s += n * uAmount * mid * 0.6;
  outColor = vec4(max(s, 0.0) * c.a, c.a);
}
