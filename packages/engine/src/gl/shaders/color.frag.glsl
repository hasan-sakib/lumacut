// The colour grade (docs/color.md). packages/engine/src/color/reference.ts is the same maths in
// TypeScript and is what this shader is tested against: change them together.
precision highp sampler3D;
uniform sampler2D uSrc;
uniform sampler2D uCurves;   // 256 x 7, R16F: master, r, g, b, hueVsSat, hueVsHue, lumVsSat
uniform sampler3D uLut;
uniform float uTemperature, uTint, uExposure, uContrast, uHighlights, uShadows, uWhites, uBlacks;
uniform float uSaturation, uVibrance;
uniform vec3 uLift, uGamma, uGain, uOffset;
uniform bool uHasCurves, uHasBands, uHasLut;
uniform vec3 uBands[8];        // hue, saturation, luminance per band
uniform float uLutIntensity;
uniform vec3 uLutDomainMin, uLutDomainMax;
uniform float uLutSize;

const float PIVOT = 0.18;
const float BAND_HUES[8] = float[8](0.0, 30.0, 60.0, 120.0, 180.0, 240.0, 270.0, 300.0);

vec3 rgbToHsl(vec3 c) {
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float l = (mx + mn) * 0.5;
  float d = mx - mn;
  if (d < 1e-9) return vec3(0.0, 0.0, l);
  float s = d / (1.0 - abs(2.0 * l - 1.0));
  float h;
  if (mx == c.r) h = ((c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0)) / 6.0;
  else if (mx == c.g) h = ((c.b - c.r) / d + 2.0) / 6.0;
  else h = ((c.r - c.g) / d + 4.0) / 6.0;
  return vec3(h, s, l);
}

vec3 hslToRgb(vec3 hsl) {
  float c = (1.0 - abs(2.0 * hsl.z - 1.0)) * hsl.y;
  vec3 n = vec3(0.0, 8.0, 4.0);
  vec3 k = mod(n + hsl.x * 12.0, 12.0);
  return hsl.z - (c * 0.5) * max(vec3(-1.0), min(min(k - 3.0, 9.0 - k), vec3(1.0)));
}

float curve(int row, float x) {
  float u = (clamp(x, 0.0, 1.0) * 255.0 + 0.5) / 256.0;
  return texture(uCurves, vec2(u, (float(row) + 0.5) / 7.0)).r;
}

// Steps that are exactly neutral are skipped: pow() on a GPU is only accurate to a few parts in a
// thousand, which would otherwise show up as small errors on a barely-touched grade.
vec3 tone(vec3 c) {
  if (uContrast != 0.0) {
    float k = max(0.01, 1.0 + uContrast);
    c = PIVOT * pow(max(c, 0.0) / PIVOT, vec3(k));
  }
  if (uHighlights == 0.0 && uShadows == 0.0 && uWhites == 0.0 && uBlacks == 0.0) return c;
  float l = pow(clamp(luma(c), 0.0, 1.0), 1.0 / 2.2);
  float shadowW = 1.0 - smoothstep(0.0, 0.5, l);
  float highlightW = smoothstep(0.5, 1.0, l);
  float blackW = 1.0 - smoothstep(0.0, 0.25, l);
  float whiteW = smoothstep(0.75, 1.0, l);
  float gain = exp2(uShadows * shadowW + uHighlights * highlightW + uWhites * whiteW);
  return c * gain + uBlacks * 0.04 * blackW;
}

vec3 wheels(vec3 c) {
  c = c * (1.0 + uGain);
  c += uOffset * 0.1;
  c += uLift * 0.1 * (1.0 - clamp(c, 0.0, 1.0));
  vec3 g = max(1.0 + uGamma, vec3(0.05));
  vec3 bent = pow(max(c, 0.0), 1.0 / g);
  return mix(max(c, 0.0), bent, notEqual(g, vec3(1.0)));
}

vec3 curvesAndBands(vec3 c) {
  if (!uHasCurves && !uHasBands) return c;
  vec3 e = clamp(toSrgb(c), 0.0, 1.0);
  if (uHasCurves) {
    e = vec3(curve(0, curve(1, e.r)), curve(0, curve(2, e.g)), curve(0, curve(3, e.b)));
  }
  vec3 hsl = rgbToHsl(e);
  float h = hsl.x, s = hsl.y, l = hsl.z;
  float live = smoothstep(0.02, 0.2, s);
  if (uHasCurves) {
    float sat = curve(4, h) * 2.0;
    float hue = curve(5, h) - 0.5;
    float lum = curve(6, l) * 2.0;
    s = clamp(s * (1.0 + (sat - 1.0) * live) * (1.0 + (lum - 1.0)), 0.0, 1.0);
    h = fract(h + hue * live);
  }
  if (uHasBands) {
    float dh = 0.0, ds = 0.0, dl = 0.0;
    float liveBand = smoothstep(0.02, 0.2, s);
    for (int i = 0; i < 8; i++) {
      float d = abs(mod(h * 360.0 - BAND_HUES[i] + 540.0, 360.0) - 180.0);
      float w = max(0.0, 1.0 - d / 45.0) * liveBand;
      dh += w * uBands[i].x;
      ds += w * uBands[i].y;
      dl += w * uBands[i].z;
    }
    h = fract(h + dh * 30.0 / 360.0);
    s = clamp(s * (1.0 + ds), 0.0, 1.0);
    l = clamp(l + dl * 0.2, 0.0, 1.0);
  }
  return toLinear(hslToRgb(vec3(h, s, l)));
}

vec3 saturationVibrance(vec3 c) {
  float y = luma(c);
  vec3 e = clamp(toSrgb(c), 0.0, 1.0);
  float chroma = max(e.r, max(e.g, e.b)) - min(e.r, min(e.g, e.b));
  float amount = 1.0 + uSaturation + uVibrance * (1.0 - chroma);
  return y + (c - y) * amount;
}

vec3 applyLut(vec3 c) {
  vec3 e = clamp(toSrgb(c), 0.0, 1.0);
  vec3 p = clamp((e - uLutDomainMin) / (uLutDomainMax - uLutDomainMin), 0.0, 1.0);
  vec3 uvw = (p * (uLutSize - 1.0) + 0.5) / uLutSize;
  vec3 mapped = toLinear(texture(uLut, uvw).rgb);
  return mix(c, mapped, uLutIntensity);
}

void main() {
  vec4 p = texture(uSrc, vUv);
  vec3 c = p.a > 0.0 ? p.rgb / p.a : vec3(0.0);
  c *= vec3(exp2(uTemperature * 0.005), exp2(-uTint * 0.005), exp2(-uTemperature * 0.005));
  c *= exp2(uExposure);
  c = tone(c);
  c = wheels(c);
  c = curvesAndBands(c);
  c = saturationVibrance(c);
  if (uHasLut) c = applyLut(c);
  outColor = vec4(c * p.a, p.a);
}
