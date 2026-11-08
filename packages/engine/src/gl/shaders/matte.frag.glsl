// A track matte: the clip (uClip) takes its transparency from another clip (uMatte), both drawn
// alone at composition size (so both are bottom-up targets in the same orientation).
uniform sampler2D uClip;
uniform sampler2D uMatte;
uniform int uMode;   // 0 alpha, 1 inverted alpha, 2 luma, 3 inverted luma

void main() {
  vec4 c = texture(uClip, vUv);
  vec4 m = texture(uMatte, vUv);
  float k = (uMode == 0 || uMode == 1) ? m.a : luma(m.rgb);
  if (uMode == 1 || uMode == 3) k = 1.0 - k;
  outColor = c * clamp(k, 0.0, 1.0);
}
