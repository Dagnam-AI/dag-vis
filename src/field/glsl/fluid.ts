import { BASE_WEIGHT } from "../cpu/fluid.js";
import { MAX_FLUID_POINTS } from "../spec.js";

/**
 * GLSL twin of `cpu/fluid.ts`, without the grain (the shared main adds it). Needs
 * `GLSL_HEADER`, `GLSL_COMMON_UNIFORMS` (for `uAspect`) and `GLSL_OKLAB` from
 * `common.ts` first, then `GLSL_MAIN` after it with `fieldColor` defined as
 * `fluidColor`.
 *
 * The shader never recomputes the drift or converts a colour. The host packs the
 * results of the CPU functions into uniforms: `uPos` is `fluidPositions(spec, theta)`
 * (x, y pairs: `n * 2` numbers), `uLab` is `fluidLab(spec)` (L, a, b triples), `uSigma`
 * holds 2σ² per point with σ = softness × spread (the divisor of the exponent),
 * `uBaseLab` is the base colour in OKLab and `uCount` the number of points. The
 * arrays hold `MAX_FLUID_POINTS` (8) entries, the most a validated spec has; entries
 * from `uCount` on are never read.
 *
 * Built-ins whose precision a driver may choose: `exp` (the Gaussian weight; the
 * exponent runs from 0 down to about -1e18, a weight below float32's smallest is 0 on
 * the GPU as it is on the CPU, and the result is then exactly the base colour) and
 * `pow` (inside `oklabToRgb`, as for every field). No trigonometry is used: the drift
 * is on the CPU, which is also why the shader needs none of `sinP`/`cosP`. Measured
 * against `fluidSampler` on SwiftShader (headless Chromium, 82 pictures from 12x36
 * to 64x16, one to eight points, softness 0.01 to 2, spread 0.1 to 4, drift 0 to 0.5,
 * grain on and off, looped and free-running time, saturated and out-of-gamut colours):
 * every channel within 0.0021/255, so the 2/255 agreement holds for every legal
 * setting, not only the presets. The grain is the shared integer hash and is
 * bit-exact. Other GPUs' `exp` and `pow` are not measured.
 */
export const GLSL_FLUID = `
uniform int uCount;
uniform vec2 uPos[${MAX_FLUID_POINTS}];
uniform vec3 uLab[${MAX_FLUID_POINTS}];
uniform float uSigma[${MAX_FLUID_POINTS}];
uniform vec3 uBaseLab;

vec3 fluidColor(vec2 uv) {
  vec3 lab = uBaseLab * ${BASE_WEIGHT};
  float wsum = ${BASE_WEIGHT};
  for (int i = 0; i < ${MAX_FLUID_POINTS}; i++) {
    if (i >= uCount) break;
    vec2 d = vec2((uv.x - uPos[i].x) * uAspect, uv.y - uPos[i].y);
    float w = exp(-dot(d, d) / uSigma[i]);
    lab += w * uLab[i];
    wsum += w;
  }
  return oklabToRgb(lab / wsum);
}
`;
