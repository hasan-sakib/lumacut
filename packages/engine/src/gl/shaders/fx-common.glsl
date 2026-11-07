// Shared by every effect/colour/transition fragment shader. Conventions:
//  * Colour is linear, premultiplied RGBA unless a function says otherwise.
//  * `vUv` is a texture coordinate (v = 0 is the bottom stored row). Anything with a direction on
//    the picture (blur angle, wave, gradient) must use imageUv(), which has v = 0 at the TOP.
//  * No randomness other than hash noise keyed on pixel position, uFrame and a seed.
in vec2 vUv;
out vec4 outColor;
uniform vec2 uSize;      // destination size in pixels
uniform int uFrame;      // composition frame index (time-dependent effects)

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
float luma(vec3 c) { return dot(c, LUMA); }

vec2 imageUv() { return vec2(vUv.x, 1.0 - vUv.y); }
vec2 toTexture(vec2 imageUv) { return vec2(imageUv.x, 1.0 - imageUv.y); }
vec2 pixelPos() { return imageUv() * uSize; }

vec3 toSrgb(vec3 c) {
  c = max(c, 0.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
vec3 toLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}

vec4 unpremultiply(vec4 c) { return c.a > 0.0 ? vec4(c.rgb / c.a, c.a) : vec4(0.0); }

// Deterministic hash noise in [0, 1): integer hash of (pixel, frame, seed). Same inputs give the
// same value on every run and every GPU that implements 32-bit integer maths.
uint hash3(uvec3 v) {
  uint h = v.x * 0x9E3779B1u ^ v.y * 0x85EBCA77u ^ v.z * 0xC2B2AE3Du;
  h ^= h >> 15; h *= 0x2C1B3C6Du; h ^= h >> 12; h *= 0x297A2D39u; h ^= h >> 15;
  return h;
}
float noise(vec2 px, int frame, int seed) {
  uvec3 v = uvec3(uint(floor(px.x)), uint(floor(px.y)), uint(frame) * 7919u + uint(seed));
  return float(hash3(v) >> 8) / 16777216.0;
}
