/**
 * GLSL ES 3.0 twins of `noise.ts`, `oklab.ts` and `lut.ts` (plus the pixel grain).
 * Keep the maths line-for-line identical with the CPU files. Integer parts are
 * bit-exact (uint arithmetic wraps modulo 2^32 like `Math.imul` with `>>> 0`); the
 * continuous parts agree to float32 precision.
 */

export const GLSL_HEADER = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
`;

export const GLSL_COMMON_UNIFORMS = `
uniform int uWidth;
uniform int uHeight;
uniform float uAspect;
uniform uint uSeed;
uniform float uGrain;
uniform int uGrainFrame;
uniform uint uGrainSeed;
uniform vec2 uTime;
`;

/** `hash4` of `noise.ts`. Lattice coordinates arrive as ivec4: `uint(int)` keeps the bit pattern, like ToInt32 on the CPU. */
export const GLSL_HASH = `
uint hash4(ivec4 p, uint seed) {
  uint h = (uint(p.x) * 0x9E3779B1u) ^ (uint(p.y) * 0x85EBCA77u) ^ (uint(p.z) * 0xC2B2AE3Du) ^ (uint(p.w) * 0x27D4EB2Fu) ^ seed;
  h = (h ^ (h >> 16)) * 0x7FEB352Du;
  h = (h ^ (h >> 15)) * 0x846CA68Bu;
  return h ^ (h >> 16);
}
float hash01(ivec4 p, uint seed) {
  return float(hash4(p, seed)) / 4294967296.0;
}
`;

/** `simplex4` and `fbm` of `noise.ts` (the octave loop is capped at 5, as on the CPU). Coordinates must stay inside +-2^28. */
export const GLSL_SIMPLEX4 = `
const float F4 = 0.30901699437494745;
const float G4 = 0.1381966011250105;
vec4 grad4(uint g) {
  float a = (g & 4u) != 0u ? -1.0 : 1.0;
  float b = (g & 2u) != 0u ? -1.0 : 1.0;
  float c = (g & 1u) != 0u ? -1.0 : 1.0;
  uint zero = g >> 3;
  if (zero == 0u) return vec4(0.0, a, b, c);
  if (zero == 1u) return vec4(a, 0.0, b, c);
  if (zero == 2u) return vec4(a, b, 0.0, c);
  return vec4(a, b, c, 0.0);
}
float corner4(vec4 d, ivec4 c, uint seed) {
  float t = 0.5 - dot(d, d);
  if (t < 0.0) return 0.0;
  vec4 g = grad4(hash4(c, seed) & 31u);
  t *= t;
  return t * t * dot(g, d);
}
float simplex4(vec4 p, uint seed) {
  float s = (p.x + p.y + p.z + p.w) * F4;
  vec4 fl = floor(p + s);
  ivec4 c0 = ivec4(fl);
  float t = (fl.x + fl.y + fl.z + fl.w) * G4;
  vec4 d0 = p - (fl - t);
  ivec4 rank = ivec4(0);
  if (d0.x > d0.y) rank.x += 1; else rank.y += 1;
  if (d0.x > d0.z) rank.x += 1; else rank.z += 1;
  if (d0.x > d0.w) rank.x += 1; else rank.w += 1;
  if (d0.y > d0.z) rank.y += 1; else rank.z += 1;
  if (d0.y > d0.w) rank.y += 1; else rank.w += 1;
  if (d0.z > d0.w) rank.z += 1; else rank.w += 1;
  ivec4 o1 = ivec4(greaterThanEqual(rank, ivec4(3)));
  ivec4 o2 = ivec4(greaterThanEqual(rank, ivec4(2)));
  ivec4 o3 = ivec4(greaterThanEqual(rank, ivec4(1)));
  vec4 d1 = d0 - vec4(o1) + G4;
  vec4 d2 = d0 - vec4(o2) + 2.0 * G4;
  vec4 d3 = d0 - vec4(o3) + 3.0 * G4;
  vec4 d4 = d0 - 1.0 + 4.0 * G4;
  float n = corner4(d0, c0, seed) + corner4(d1, c0 + o1, seed) + corner4(d2, c0 + o2, seed)
          + corner4(d3, c0 + o3, seed) + corner4(d4, c0 + 1, seed);
  return 27.0 * n;
}
float fbm(vec2 p, vec2 tz, int octaves, uint seed) {
  float amp = 0.5;
  float f = 1.0;
  float sum = 0.0;
  float norm = 0.0;
  for (int o = 0; o < 5; o++) {
    if (o >= octaves) break;
    sum += amp * simplex4(vec4(p * f, tz), seed + uint(o) * 101u);
    norm += amp;
    amp *= 0.5;
    f *= 2.0;
  }
  return sum / norm;
}
`;

/** `oklabToRgb` of `oklab.ts` (linear RGB clamped before companding). */
export const GLSL_OKLAB = `
float linearToSrgb(float c) {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * pow(c, 1.0 / 2.4) - 0.055;
}
vec3 oklabToRgb(vec3 lab) {
  float l_ = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
  float m_ = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
  float s_ = lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z;
  float l = l_ * l_ * l_;
  float m = m_ * m_ * m_;
  float s = s_ * s_ * s_;
  vec3 lin = clamp(vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s), 0.0, 1.0);
  return vec3(linearToSrgb(lin.r), linearToSrgb(lin.g), linearToSrgb(lin.b));
}
`;

/** `sampleLut` of `lut.ts`: `uLut` is the 256x1 RGB float texture holding the same array `paletteLut` returns. */
export const GLSL_LUT = `
uniform sampler2D uLut;
vec3 lutColor(float v) {
  float f = clamp(v, 0.0, 1.0) * 255.0;
  int i = min(254, int(floor(f)));
  float fr = f - float(i);
  vec3 a = texelFetch(uLut, ivec2(i, 0), 0).rgb;
  vec3 b = texelFetch(uLut, ivec2(i + 1, 0), 0).rgb;
  return a * (1.0 - fr) + b * fr;
}
`;

/**
 * Shared main: integer pixel coordinates (top-down like the CPU), uv at pixel centres,
 * then grain. The grain hashes the INTEGER pixel, the frame and a constant, so it is
 * bit-exact. `uSeed` drives the noise; `uGrainSeed` drives the grain (the outer seed).
 * Each field shader defines `vec3 fieldColor(vec2 uv)`.
 */
export const GLSL_MAIN = `
out vec4 fragColor;
void main() {
  ivec2 px = ivec2(int(gl_FragCoord.x), uHeight - 1 - int(gl_FragCoord.y));
  vec2 uv = (vec2(px) + 0.5) / vec2(float(uWidth), float(uHeight));
  vec3 c = fieldColor(uv);
  float g = hash01(ivec4(px, uGrainFrame, 0x9E37), uGrainSeed);
  c += (g - 0.5) * uGrain * 0.35;
  fragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;
