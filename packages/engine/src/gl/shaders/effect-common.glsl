// Helpers for effect and transition passes (added after fx-common.glsl).
//  * uSrc is the previous pass (the effect's input for the first pass); uOrig is always the input.
//  * "Target pixels" include `uPad` pixels of transparent margin on every side; `contentUv()` runs
//    0..1 over the layer itself, top-left origin, so effects stay put when the margin changes.
uniform sampler2D uSrc;
uniform sampler2D uOrig;
uniform float uScale;   // target pixels per layer pixel
uniform float uPad;     // margin in target pixels

vec2 contentSize() { return max(uSize - 2.0 * uPad, vec2(1.0)); }
vec2 contentUv() { return (pixelPos() - vec2(uPad)) / contentSize(); }
vec2 fromContent(vec2 c) { return c * contentSize() + vec2(uPad); }

vec4 here() { return texture(uSrc, vUv); }
vec4 hereOrig() { return texture(uOrig, vUv); }
// Sample at a position given in target pixels, top-left origin (what pixelPos() returns).
vec4 tapSrc(vec2 p) { return texture(uSrc, toTexture(p / uSize)); }
vec4 tapOrig(vec2 p) { return texture(uOrig, toTexture(p / uSize)); }

vec3 straight(vec4 c) { return c.a > 0.0 ? c.rgb / c.a : vec3(0.0); }
mat2 rot2(float a) { float c = cos(a); float s = sin(a); return mat2(c, s, -s, c); }

// Smooth value noise in [0, 1], static for a given seed (shift the input to animate it).
float vnoise(vec2 p, int seed) {
  p += vec2(8192.0);
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = noise(i, 0, seed);
  float b = noise(i + vec2(1.0, 0.0), 0, seed);
  float c = noise(i + vec2(0.0, 1.0), 0, seed);
  float d = noise(i + vec2(1.0, 1.0), 0, seed);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
