// Draws the visible (cropped) part of a layer into a layer-local target, as linear premultiplied
// colour, with `uPad` pixels of transparent margin on every side (for effects that spread).
uniform sampler2D uSrc;
uniform int uSrcKind;      // 0: 8-bit sRGB-encoded premultiplied; 1: linear premultiplied
uniform bool uSrcFlipV;    // render-target sources are stored bottom-up
uniform vec2 uSrcSize;     // uncropped layer size in pixels
uniform vec4 uRect;        // cropped rectangle in layer pixels (exact: may be fractional)
uniform vec2 uOrigin;      // layer pixel at the target's corner (whole pixels, so grids line up)
uniform float uPad;        // transparent margin, in target pixels
uniform float uScale;      // target pixels per layer pixel (< 1 when the layer is drawn smaller)

void main() {
  vec2 layerPx = uOrigin + (pixelPos() - vec2(uPad)) / uScale;
  vec2 lo = uRect.xy;
  vec2 hi = uRect.xy + uRect.zw;
  if (any(lessThan(layerPx, lo)) || any(greaterThanEqual(layerPx, hi))) {
    outColor = vec4(0.0);
    return;
  }
  vec2 suv = layerPx / uSrcSize;
  vec2 tuv = uSrcFlipV ? vec2(suv.x, 1.0 - suv.y) : suv;
  vec4 t = texture(uSrc, tuv);
  if (uSrcKind == 1) {
    outColor = t;
    return;
  }
  vec3 straight = t.a > 0.0 ? t.rgb / t.a : vec3(0.0);
  outColor = vec4(toLinear(straight) * t.a, t.a);
}
