// All 24 blend modes. Colours are straight (not premultiplied) values in the compositing space.
// Mirrors packages/engine/src/blend/reference.ts, which the tests compare this against.
// BLEND_CONSTANTS (const int BM_<MODE> = index) are generated from the schema's mode list.

float bl_multiply(float cb, float cs) { return cb * cs; }
float bl_screen(float cb, float cs) { return cb + cs - cb * cs; }
float bl_hardLight(float cb, float cs) {
  return cs <= 0.5 ? bl_multiply(cb, 2.0 * cs) : bl_screen(cb, 2.0 * cs - 1.0);
}
float bl_colorDodge(float cb, float cs) {
  if (cb == 0.0) return 0.0;
  if (cs >= 1.0) return 1.0;
  return min(1.0, cb / (1.0 - cs));
}
float bl_colorBurn(float cb, float cs) {
  if (cb >= 1.0) return 1.0;
  if (cs <= 0.0) return 0.0;
  return 1.0 - min(1.0, (1.0 - cb) / cs);
}
float bl_softLight(float cb, float cs) {
  if (cs <= 0.5) return cb - (1.0 - 2.0 * cs) * cb * (1.0 - cb);
  float d = cb <= 0.25 ? ((16.0 * cb - 12.0) * cb + 4.0) * cb : sqrt(cb);
  return cb + (2.0 * cs - 1.0) * (d - cb);
}
float bl_vividLight(float cb, float cs) {
  return cs < 0.5 ? bl_colorBurn(cb, 2.0 * cs) : bl_colorDodge(cb, 2.0 * (cs - 0.5));
}
float bl_pinLight(float cb, float cs) {
  return cs < 0.5 ? min(cb, 2.0 * cs) : max(cb, 2.0 * (cs - 0.5));
}
float bl_divide(float cb, float cs) { return cs == 0.0 ? 1.0 : min(1.0, cb / cs); }

#define PER_CHANNEL(f) vec3(f(cb.r, cs.r), f(cb.g, cs.g), f(cb.b, cs.b))

float lum(vec3 c) { return 0.3 * c.r + 0.59 * c.g + 0.11 * c.b; }
float sat(vec3 c) { return max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b)); }

vec3 clipColor(vec3 c) {
  float l = lum(c);
  float n = min(c.r, min(c.g, c.b));
  float x = max(c.r, max(c.g, c.b));
  if (n < 0.0) c = l + (c - l) * l / (l - n);
  if (x > 1.0) c = l + (c - l) * (1.0 - l) / (x - l);
  return c;
}
vec3 setLum(vec3 c, float l) { return clipColor(c + (l - lum(c))); }
vec3 setSat(vec3 c, float s) {
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  return mx > mn ? (c - mn) * s / (mx - mn) : vec3(0.0);
}

vec3 blendColors(int mode, vec3 cb, vec3 cs) {
  switch (mode) {
    case BM_NORMAL: return cs;
    case BM_DARKEN: return min(cb, cs);
    case BM_MULTIPLY: return cb * cs;
    case BM_COLORBURN: return PER_CHANNEL(bl_colorBurn);
    case BM_LINEARBURN: return max(vec3(0.0), cb + cs - 1.0);
    case BM_LIGHTEN: return max(cb, cs);
    case BM_SCREEN: return cb + cs - cb * cs;
    case BM_COLORDODGE: return PER_CHANNEL(bl_colorDodge);
    case BM_ADD: return min(vec3(1.0), cb + cs);
    case BM_OVERLAY: return vec3(bl_hardLight(cs.r, cb.r), bl_hardLight(cs.g, cb.g), bl_hardLight(cs.b, cb.b));
    case BM_SOFTLIGHT: return PER_CHANNEL(bl_softLight);
    case BM_HARDLIGHT: return PER_CHANNEL(bl_hardLight);
    case BM_VIVIDLIGHT: return PER_CHANNEL(bl_vividLight);
    case BM_LINEARLIGHT: return clamp(cb + 2.0 * cs - 1.0, 0.0, 1.0);
    case BM_PINLIGHT: return PER_CHANNEL(bl_pinLight);
    case BM_HARDMIX: return vec3(cb.r + cs.r >= 1.0 ? 1.0 : 0.0, cb.g + cs.g >= 1.0 ? 1.0 : 0.0, cb.b + cs.b >= 1.0 ? 1.0 : 0.0);
    case BM_DIFFERENCE: return abs(cb - cs);
    case BM_EXCLUSION: return cb + cs - 2.0 * cb * cs;
    case BM_SUBTRACT: return max(vec3(0.0), cb - cs);
    case BM_DIVIDE: return PER_CHANNEL(bl_divide);
    case BM_HUE: return setLum(setSat(cs, sat(cb)), lum(cb));
    case BM_SATURATION: return setLum(setSat(cb, sat(cs)), lum(cb));
    case BM_COLOR: return setLum(cs, lum(cb));
    case BM_LUMINOSITY: return setLum(cb, lum(cs));
  }
  return cs;
}
