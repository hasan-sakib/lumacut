#version 300 es
precision highp float;
precision highp sampler2D;

uniform sampler2D uAccum;   // premultiplied linear composition
out vec4 outColor;

vec3 linearToSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}

void main() {
  vec4 t = texelFetch(uAccum, ivec2(gl_FragCoord.xy), 0);
  vec3 straight = t.a > 0.0 ? t.rgb / t.a : vec3(0.0);
  // The canvas expects premultiplied, sRGB-encoded colour.
  outColor = vec4(linearToSrgb(clamp(straight, 0.0, 1.0)) * t.a, t.a);
}
