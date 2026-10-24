import { hash01 } from "../noise.js";
import type { ResolvedFluted } from "../spec.js";
import { flowSampler } from "./flow.js";
import { fluidSampler } from "./fluid.js";
import { grainOffset } from "./grain.js";
import { assertPixelCount, UV_REACH, uvError } from "./guards.js";
import type { Sampler } from "./types.js";

/** Hash tag for reed jitter, in the hash's second slot: keeps it off the lattice and grain streams. */
const REED_TAG = 0x51ed;

/**
 * Per-reed offset along the reed axis, in uv units: `(hash - 0.5) · jitter / reeds`, so
 * it lies within `±jitter / (2 reeds)` and is 0 when `jitter` is 0. It depends only on
 * the fluted field's own `seed`. The GPU receives the same numbers as the `uOffsets`
 * uniform (padded to `MAX_REEDS`, float32).
 */
export function reedOffsets(spec: ResolvedFluted): Float64Array {
  const o = new Float64Array(spec.reeds);
  for (let i = 0; i < spec.reeds; i++)
    o[i] =
      (hash01(i, REED_TAG, 0, 0, spec.seed) - 0.5) *
        (spec.jitter / spec.reeds) +
      0; // + 0 turns a -0 (jitter 0, hash below 0.5) into +0
  return o;
}

/**
 * The reed that pixel `p` (0-based, of `size` pixels across the reed axis) falls in:
 * `floor((2p + 1) · reeds / (2 size))`, the reed under the pixel's centre. It is plain
 * integer arithmetic, so a centre exactly on a reed edge belongs to the reed on its
 * right, and the shader (GLSL integer division) gets the identical answer. The float
 * form `floor((p + 0.5) / size · reeds)` is not safe: e.g. pixel 52 of 100 with 120
 * reeds sits exactly on the edge of reed 63, and float32 rounds the quotient down to
 * reed 62. `p` must be in `0..size-1`, which keeps the result in `0..reeds-1`.
 */
export function reedIndex(p: number, size: number, reeds: number): number {
  return Math.floor(((2 * p + 1) * reeds) / (2 * size));
}

/** GLSL `smoothstep` for e0 < e1. */
function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/**
 * The `fluted` field on the CPU: the picture of a `flow` or `fluid` source seen through
 * a row of glass reeds. Across the reed axis (`u` for vertical reeds, `v` for
 * horizontal ones) the picture is cut into `reeds` equal strips; inside strip `i` the
 * source is read at `c + (a - c)(1 - refraction) + offset[i]`, with `c` the strip's
 * centre and `a` the coordinate, so `refraction` 1 shows one column per strip and 0
 * leaves the source unbent. The strip is then shaded: `shade` darkens its left (top)
 * edge by up to 0.7 over the first 0.3 of its width and lightens its right (bottom)
 * edge by up to 0.35 over the last 0.3. The fluted field's own grain is added last
 * (its source's grain is zero). The maths is the same, line for line, as `GLSL_FLUTED`
 * plus the shared main.
 *
 * The strip is that of the pixel containing the coordinate, found with `reedIndex`
 * (exact integer arithmetic, so CPU and GPU never disagree on a pixel on a strip
 * edge); for a coordinate outside the picture it is the nearest strip. `width` and
 * `height` are therefore whole numbers of pixels, and `u` and `v` are normally pixel
 * centres. A NaN, infinite or huge `u` or `v` (more than 1e6 divided by max(aspect, 1))
 * throws a VisError naming it, as for `fluid`; the source may have a tighter limit of
 * its own. `px` and `py` are integer pixel coordinates (see `grainOffset`).
 *
 * `spec` comes from `resolveField`; everything the sampler needs is copied here, so
 * later changes to it do not reach the sampler. `prepare` sets the frame, `sample` is
 * pure and allocation-free; before the first `prepare` it samples at time 0.
 *
 * CPU against shader agreement: see `GLSL_FLUTED`.
 */
export function flutedSampler(
  spec: ResolvedFluted,
  width: number,
  height: number,
): Sampler {
  assertPixelCount("width", width);
  assertPixelCount("height", height);
  const source =
    spec.source.kind === "flow"
      ? flowSampler(spec.source, width, height)
      : fluidSampler(spec.source, width, height);
  const offsets = reedOffsets(spec);
  const vertical = spec.direction === "vertical";
  const { reeds, refraction, shade, seed, grain, animatedGrain } = spec;
  const size = vertical ? width : height;
  const d = 2 * size;
  const uvLimit = UV_REACH / Math.max(width / height, 1);
  let frame = 0;
  return {
    prepare(tc) {
      source.prepare(tc);
      frame = animatedGrain ? tc.grainFrame : 0;
    },
    sample(u, v, px, py, out) {
      // `!(<=)` so NaN fails too.
      if (!(Math.abs(u) <= uvLimit)) uvError("u", u, uvLimit);
      if (!(Math.abs(v) <= uvLimit)) uvError("v", v, uvLimit);
      const a = vertical ? u : v;
      const p = Math.min(size - 1, Math.max(0, Math.floor(a * size)));
      const i = reedIndex(p, size, reeds);
      const f = ((2 * p + 1) * reeds - i * d) / d;
      const c = (i + 0.5) / reeds;
      const a2 = c + (a - c) * (1 - refraction) + Number(offsets[i]);
      if (vertical) source.sample(a2, v, px, py, out);
      else source.sample(u, a2, px, py, out);
      const m =
        1 -
        shade * 0.7 * (1 - smoothstep(0, 0.3, f)) +
        shade * 0.35 * smoothstep(0.7, 1, f);
      const g = grainOffset(px, py, frame, seed, grain);
      out[0] = Number(out[0]) * m + g;
      out[1] = Number(out[1]) * m + g;
      out[2] = Number(out[2]) * m + g;
    },
  };
}
