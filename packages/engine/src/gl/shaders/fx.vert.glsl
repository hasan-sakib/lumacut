#version 300 es
// Full-screen triangle for effect passes. vUv is the texture coordinate of the destination:
// (0, 0) is the first stored row, which for render targets is the BOTTOM of the picture.
out vec2 vUv;

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
