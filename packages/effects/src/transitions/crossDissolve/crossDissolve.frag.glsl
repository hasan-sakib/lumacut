uniform bool uSmooth;

void main() {
  vec2 uv = imageUv();
  float p = uSmooth ? ease(uProgress) : uProgress;
  outColor = mix(A(uv), B(uv), p);
}
