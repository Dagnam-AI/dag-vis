import { MAX_REEDS } from "../spec.js";

/**
 * GLSL twin of `cpu/fluted.ts`, without the grain (the shared main adds it). Needs
 * `GLSL_HEADER`, `GLSL_COMMON_UNIFORMS` (`uWidth`, `uHeight`) and the source's own code
 * first; `SOURCE` is a macro the host defines as `flowColor` or `fluidColor`, and the
 * shared main comes after with this `fieldColor`.
 *
 * Uniforms: `uReeds`, `uVertical` (1 for vertical reeds, else 0), `uRefraction`,
 * `uShade`, and `uOffsets`, the `reedOffsets` of the spec padded with zeros to
 * `MAX_REEDS` (256) float32 numbers and packed four to a `vec4` (64 of them): a plain
 * `float[256]` would take 256 uniform vectors, more than the 224 the GLSL ES 3.0
 * minimum guarantees a fragment shader. Entries from `uReeds` on are never read.
 *
 * The reed is found with integer arithmetic on the pixel, never with
 * `floor(uv * reeds)`. The pixel is recovered from `uv = (p + 0.5) / size`: the
 * float32 round trip `uv * size` stays within 2e-3 of `p + 0.5` for any size up to
 * 16384, far inside the 0.5 margin to either neighbour, so the `floor` is safe. Then
 * `n = (2p + 1) reeds` and `d = 2 size` are `int`s and `i = n / d` is exact integer
 * division, like `reedIndex` on the CPU. The remainder `n - i d` is below `d`, so it is
 * exact in float32 and `f` is one correctly rounded division. A pixel centre exactly on
 * a reed edge therefore lands in the same reed on both sides. The float form does not:
 * pixel 52 of 100 with 120 reeds sits exactly on an edge and float32 puts it one reed
 * too low.
 *
 * Built-ins used: `floor`, `clamp` and `smoothstep` (only arithmetic, no
 * transcendental), plus integer division and shifts. No `pow`, `exp`, `sin` or `cos`
 * of its own.
 *
 * Measured against `flutedSampler` on SwiftShader (headless Chromium, 173 pictures
 * from 31x29 to 8192x2 and 1x8192, both directions, both sources, flow shapes swirl,
 * wave, aurora and noise, 2 to 256 reeds, refraction 0 to 1, shade 0 to 1, jitter 0 to 1,
 * grain on and off, looped and free-running time, widths that do not divide evenly,
 * and 19328 pixels whose centre is on an exact reed edge): every channel within 0.42/255
 * (a wider replay with a flow source of 1000x2 pixels and 120 reeds reached 0.56/255),
 * except one deliberately extreme flow source (aurora at scale 10, warp scale 10,
 * strength 3, octaves 5) at 3.5/255, which is the flow source's own float32 limit and
 * not the reeds'. So the 2/255 agreement holds for the presets and the normal ranges,
 * and the reed edge never flips. Other GPUs are not measured; the integer reed lookup does not
 * depend on the GPU's `floor`, division or `smoothstep` accuracy beyond ordinary
 * rounding.
 */
export const GLSL_FLUTED = `
uniform int uReeds;
uniform int uVertical;
uniform float uRefraction;
uniform float uShade;
uniform vec4 uOffsets[${MAX_REEDS / 4}];

vec3 fieldColor(vec2 uv) {
  bool vertical = uVertical == 1;
  float a = vertical ? uv.x : uv.y;
  int size = vertical ? uWidth : uHeight;
  int p = int(clamp(floor(a * float(size)), 0.0, float(size - 1)));
  int n = (2 * p + 1) * uReeds;
  int d = 2 * size;
  int i = n / d;
  float f = float(n - i * d) / float(d);
  float c = (float(i) + 0.5) / float(uReeds);
  float a2 = c + (a - c) * (1.0 - uRefraction) + uOffsets[i >> 2][i & 3];
  vec3 col = SOURCE(vertical ? vec2(a2, uv.y) : vec2(uv.x, a2));
  float m = 1.0 - uShade * 0.7 * (1.0 - smoothstep(0.0, 0.3, f)) + uShade * 0.35 * smoothstep(0.7, 1.0, f);
  return col * m;
}
`;
