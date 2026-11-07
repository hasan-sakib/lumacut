// Helpers for transition shaders (added after fx-common.glsl). uA is the outgoing clip and uB the
// incoming one, both rendered at composition size; uv arguments are image coordinates (top-left
// origin, 0..1) and anything outside the picture is transparent.
uniform sampler2D uA;
uniform sampler2D uB;
uniform float uProgress;   // 0..1 through the transition

float ease(float t) { return t * t * (3.0 - 2.0 * t); }

bool outside(vec2 iuv) { return any(lessThan(iuv, vec2(0.0))) || any(greaterThan(iuv, vec2(1.0))); }
vec4 A(vec2 iuv) { return outside(iuv) ? vec4(0.0) : texture(uA, toTexture(iuv)); }
vec4 B(vec2 iuv) { return outside(iuv) ? vec4(0.0) : texture(uB, toTexture(iuv)); }
mat2 rot2(float a) { float c = cos(a); float s = sin(a); return mat2(c, s, -s, c); }
