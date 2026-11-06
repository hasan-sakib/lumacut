#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 vUv;
uniform sampler2D uLayer;
uniform sampler2D uBackdrop;   // accumulated composition so far (BLEND variant only)
uniform float uOpacity;
uniform int uSourceKind;       // 0: 8-bit sRGB-encoded, premultiplied (video, images); 1: linear, premultiplied (nested comps)
uniform bool uFlipV;           // render-target textures are stored bottom-up
uniform int uMode;             // blend mode index (BLEND variant only)
out vec4 outColor;

//__BLEND__

// Working space is linear Rec. 709 / sRGB primaries. This transfer pair is the only place
// encoded values enter the compositor, so the whole engine can be switched in one spot.
vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}

// Returns premultiplied linear colour.
vec4 sampleLayer() {
  vec2 uv = uFlipV ? vec2(vUv.x, 1.0 - vUv.y) : vUv;
  vec4 t = texture(uLayer, uv);
  if (uSourceKind == 1) return t;
  vec3 straight = t.a > 0.0 ? t.rgb / t.a : vec3(0.0);
  return vec4(srgbToLinear(straight) * t.a, t.a);
}

void main() {
  vec4 layer = sampleLayer() * uOpacity;
#ifdef BLEND
  vec4 backdrop = texelFetch(uBackdrop, ivec2(gl_FragCoord.xy), 0);
  float as = layer.a;
  float ab = backdrop.a;
  vec3 cs = as > 0.0 ? layer.rgb / as : vec3(0.0);
  vec3 cb = ab > 0.0 ? backdrop.rgb / ab : vec3(0.0);
  vec3 b = blendColors(uMode, cb, cs);
  // W3C general compositing formula, source-over, premultiplied result.
  vec3 co = as * (1.0 - ab) * cs + as * ab * b + (1.0 - as) * backdrop.rgb;
  outColor = vec4(co, as + ab * (1.0 - as));
#else
  outColor = layer;
#endif
}
