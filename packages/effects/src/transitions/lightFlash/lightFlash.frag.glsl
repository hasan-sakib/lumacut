uniform vec4 uColor;
uniform float uIntensity;

void main() {
  vec2 uv = imageUv();
  vec4 base = mix(A(uv), B(uv), smoothstep(0.35, 0.65, uProgress));
  float k = exp(-pow((uProgress - 0.5) * 4.0, 2.0)) * uIntensity;
  vec3 flash = uColor.rgb * k;
  outColor = vec4(base.rgb + flash * 0.8, min(1.0, base.a + k * 0.8));
}
