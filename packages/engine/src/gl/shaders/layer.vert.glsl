#version 300 es
// Draws the (cropped) layer rectangle. Positions are computed in layer pixels, then mapped
// layer -> composition pixels -> clip space by one matrix.
layout(location = 0) in vec2 aCorner;  // (0,0) .. (1,1) over the cropped rectangle
uniform mat3 uToClip;     // layer pixels -> clip space
uniform vec4 uRect;       // cropped rectangle in layer pixels: x, y, width, height
uniform vec2 uLayerSize;  // uncropped layer size in pixels
out vec2 vUv;

void main() {
  vec2 p = uRect.xy + aCorner * uRect.zw;
  vUv = p / uLayerSize;   // v = 0 is the top row of the source image
  gl_Position = vec4((uToClip * vec3(p, 1.0)).xy, 0.0, 1.0);
}
