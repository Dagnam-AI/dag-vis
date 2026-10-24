/**
 * GLSL twin of `cpu/flow.ts`, without the grain (the shared main adds it). Needs
 * `GLSL_HEADER`, `GLSL_COMMON_UNIFORMS`, `GLSL_HASH`, `GLSL_SIMPLEX4` and `GLSL_LUT`
 * from `common.ts` first, then `GLSL_MAIN` after it. Uniform values come from the
 * resolved spec: `uShape` is `SHAPE_INDEX[shape]`, `uOctaves` / `uStrength` /
 * `uWarpScale` the warp, `uScale` the scale, `uRot` is (cos, sin) of the rotation,
 * `uHighlight` is (x, y, strength, radius), `uHighlightColor` its colour, and
 * `uHasHighlight` is 1 with a highlight and 0 without. `uTime` (common) is (z, w).
 *
 * The CPU uses Math.sin and Math.cos. Here `sinP` and `cosP` stand in for them: GLSL
 * leaves the built-in trigonometry to the driver (measured error up to 1.9e-4 in
 * headless Chromium on SwiftShader, up to about 5e-4 allowed on a real GPU), and the
 * swirl and wave shapes feed it into the warp, which amplifies it to several 1/255
 * (more than 30/255 at the extreme settings). `sinP` reduces the argument by a
 * Cody-Waite split of 2 pi, folds it into [-pi/2, pi/2] and sums the Taylor series to
 * x^11 (truncation below 6e-8), so it matches Math.sin to about 1e-6 for |x| up to
 * a few tens, whatever the driver does.
 */
export const GLSL_FLOW = `
uniform int uShape;
uniform int uOctaves;
uniform float uStrength;
uniform float uWarpScale;
uniform float uScale;
uniform vec2 uRot;
uniform float uVignette;
uniform vec4 uHighlight;
uniform vec3 uHighlightColor;
uniform int uHasHighlight;

float sinP(float x) {
  float k = floor(x * 0.15915494309189535 + 0.5);
  float r = (x - k * 6.28125) - k * 0.0019353071795864769;
  if (r > 1.5707963267948966) r = 3.141592653589793 - r;
  else if (r < -1.5707963267948966) r = -3.141592653589793 - r;
  float r2 = r * r;
  return r * (1.0 + r2 * (-1.0 / 6.0 + r2 * (1.0 / 120.0 + r2 * (-1.0 / 5040.0 + r2 * (1.0 / 362880.0 + r2 * (-1.0 / 39916800.0))))));
}
float cosP(float x) {
  return sinP(x + 1.5707963267948966);
}

float warped(vec2 p) {
  vec2 q = vec2(fbm(p, uTime, uOctaves, uSeed), fbm(p + vec2(5.2, 1.3), uTime, uOctaves, uSeed));
  vec2 r = vec2(fbm(p + uStrength * q + vec2(1.7, 9.2), uTime, uOctaves, uSeed),
                fbm(p + uStrength * q + vec2(8.3, 2.8), uTime, uOctaves, uSeed));
  return fbm(p + uStrength * r, uTime, uOctaves, uSeed);
}

vec3 flowColor(vec2 uv) {
  vec2 p = vec2((uv.x - 0.5) * uAspect, uv.y - 0.5) * uScale;
  p = vec2(p.x * uRot.x - p.y * uRot.y, p.x * uRot.y + p.y * uRot.x);
  vec2 p0 = p;
  if (uShape == 0) {
    float a = 1.5 * sqrt(p.x * p.x + p.y * p.y);
    float c = cosP(a);
    float s = sinP(a);
    p = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
  } else if (uShape == 1) {
    p.y += 0.35 * sinP(p.x * 2.0);
  } else if (uShape == 2) {
    p = vec2(p.x * 1.8, p.y * 0.45);
  }
  float n = warped(p * uWarpScale);
  float v;
  if (uShape == 4) {
    v = 0.5 + 0.5 * sinP((p.y + 0.6 * n) * 3.0);
  } else if (uShape == 3) {
    float r = clamp(sqrt(p0.x * p0.x + p0.y * p0.y) * 0.9, 0.0, 1.0);
    v = (0.5 + 0.8 * n) * 0.45 + (1.0 - r) * 0.55;
  } else {
    v = 0.5 + 0.8 * n;
  }
  vec3 c = lutColor(clamp(v, 0.0, 1.0));
  if (uHasHighlight == 1) {
    vec2 d = vec2((uv.x - uHighlight.x) * uAspect, uv.y - uHighlight.y);
    float k = 1.0 - smoothstep(0.0, uHighlight.w, sqrt(d.x * d.x + d.y * d.y));
    float h = uHighlight.z * k * k;
    c = c * (1.0 - h) + uHighlightColor * h;
  }
  vec2 vd = vec2((uv.x - 0.5) * uAspect, uv.y - 0.5);
  c *= 1.0 - uVignette * smoothstep(0.35, 0.95, sqrt(vd.x * vd.x + vd.y * vd.y) * 1.2);
  return c;
}
`;
