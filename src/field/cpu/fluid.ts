import { createRng, VisError } from "../../core/index.js";
import { describeValue } from "../../core/validate.js";
import { oklabToRgb, rgbToOklab } from "../oklab.js";
import type { ResolvedFluid } from "../spec.js";
import { grainOffset } from "./grain.js";
import { assertPositiveSize, UV_REACH, uvError } from "./guards.js";
import type { Sampler } from "./types.js";

/**
 * Weight of the base colour in every pixel, so regions far from all points settle to
 * `base`. The same literal is in `GLSL_FLUID`.
 */
export const BASE_WEIGHT = 0.02;

/** Seeded Lissajous parameters per point: integer frequencies 1..3 and phases in [0, 2π). */
export interface FluidDrift {
  kx: Int32Array;
  ky: Int32Array;
  phx: Float64Array;
  phy: Float64Array;
}

/**
 * Draws, per point and in this order, `kx`, `ky`, `phx` and `phy` from
 * `createRng(spec.seed)` (mulberry32; a seed is folded to 32 bits, and `resolveField`
 * already limits it to 0..2^32-1). They depend only on the seed and the number of
 * points, never on the colours or positions. Frequencies are integers, so every path
 * closes exactly after a phase of 2π.
 */
export function fluidDrift(spec: ResolvedFluid): FluidDrift {
  const rng = createRng(spec.seed);
  const n = spec.points.length;
  const d: FluidDrift = {
    kx: new Int32Array(n),
    ky: new Int32Array(n),
    phx: new Float64Array(n),
    phy: new Float64Array(n),
  };
  for (let i = 0; i < n; i++) {
    d.kx[i] = rng.int(1, 3);
    d.ky[i] = rng.int(1, 3);
    d.phx[i] = rng.range(0, 2 * Math.PI);
    d.phy[i] = rng.range(0, 2 * Math.PI);
  }
  return d;
}

/**
 * Point positions at phase `theta` as [x0, y0, x1, y1, …]:
 * `x = at.x + drift sin(kx θ + φx)`, `y = at.y + drift cos(ky θ + φy)`.
 * The one source of positions: the CPU sampler calls it, and the GPU packs its result
 * into the `uPos` uniform, so the shader never recomputes the drift. `theta` must be a
 * finite number (a VisError names it otherwise); pass the `drift` of `fluidDrift` to
 * avoid drawing it again.
 */
export function fluidPositions(
  spec: ResolvedFluid,
  theta: number,
  drift: FluidDrift = fluidDrift(spec),
): Float64Array {
  if (typeof theta !== "number" || !Number.isFinite(theta))
    throw new VisError(
      `theta must be a finite number, got ${describeValue(theta)}`,
    );
  const n = spec.points.length;
  const pos = new Float64Array(n * 2);
  spec.points.forEach((p, i) => {
    pos[i * 2] =
      p.at[0] +
      spec.drift * Math.sin(Number(drift.kx[i]) * theta + Number(drift.phx[i]));
    pos[i * 2 + 1] =
      p.at[1] +
      spec.drift * Math.cos(Number(drift.ky[i]) * theta + Number(drift.phy[i]));
  });
  return pos;
}

/** Point colours in OKLab, [L0, a0, b0, L1, …]: the `uLab` uniform, converted once. */
export function fluidLab(spec: ResolvedFluid): Float64Array {
  const lab = new Float64Array(spec.points.length * 3);
  spec.points.forEach((p, i) => {
    lab.set(rgbToOklab(p.color.r, p.color.g, p.color.b), i * 3);
  });
  return lab;
}

/**
 * The `fluid` field on the CPU: the colour of a pixel is the Gaussian-weighted mean,
 * in OKLab, of the point colours, `w = exp(-d² / 2σ²)` with `σ = softness × spread`
 * and `d` the distance in height units (the horizontal offset is scaled by the aspect
 * ratio), plus a constant `BASE_WEIGHT` of the base colour. Far from every point all
 * weights underflow to exactly 0 and the result is the base colour: an exponent below
 * about -745 is 0 in float64 (below about -708 it is denormal and adds nothing), so
 * there is no NaN and no step. The maths is the same, line for line, as `fluidColor`
 * in `GLSL_FLUID`; positions and colours come from `fluidPositions` and `fluidLab`,
 * which the GPU receives as uniforms.
 *
 * `spec` comes from `resolveField`; it is copied here, so later changes to it do not
 * reach the sampler. `width` and `height` set the aspect ratio. `prepare`
 * computes the positions for the frame (the only allocation, once per frame) and
 * `sample` is pure and allocation-free; before the first `prepare` it samples at
 * time 0. A NaN, infinite or huge `u` or `v` (more than 1e6 divided by max(aspect, 1))
 * throws a VisError naming it. `px` and `py` are integer pixel coordinates (see
 * `grainOffset`). The sampler does not clamp; the colour is in gamut because OKLab to
 * sRGB clamps, and only the grain can leave 0..1.
 *
 * CPU against shader agreement: every channel within 0.0021/255 over the legal
 * ranges (details in `GLSL_FLUID`).
 */
export function fluidSampler(
  spec: ResolvedFluid,
  width: number,
  height: number,
): Sampler {
  assertPositiveSize("width", width);
  assertPositiveSize("height", height);
  // A private copy: `prepare` reads the points and the drift amount on every frame.
  const own = structuredClone(spec);
  const n = own.points.length;
  const aspect = width / height;
  const uvLimit = UV_REACH / Math.max(aspect, 1);
  const { seed, grain, animatedGrain } = own;
  const drift = fluidDrift(own);
  const lab = fluidLab(own);
  const baseLab = rgbToOklab(own.base.r, own.base.g, own.base.b);
  const baseL = baseLab[0] * BASE_WEIGHT;
  const baseA = baseLab[1] * BASE_WEIGHT;
  const baseB = baseLab[2] * BASE_WEIGHT;
  // 2σ² per point, the divisor of the exponent (the `uSigma` uniform).
  const sigma2 = new Float64Array(n);
  own.points.forEach((p, i) => {
    const s = own.softness * p.spread;
    sigma2[i] = 2 * s * s;
  });
  let pos = fluidPositions(own, 0, drift);
  let frame = 0;
  return {
    prepare(tc) {
      pos = fluidPositions(own, tc.theta, drift);
      frame = animatedGrain ? tc.grainFrame : 0;
    },
    sample(u, v, px, py, out) {
      // `!(<=)` so NaN fails too.
      if (!(Math.abs(u) <= uvLimit)) uvError("u", u, uvLimit);
      if (!(Math.abs(v) <= uvLimit)) uvError("v", v, uvLimit);
      let L = baseL;
      let a = baseA;
      let b = baseB;
      let wsum = BASE_WEIGHT;
      for (let i = 0; i < n; i++) {
        const dx = (u - Number(pos[i * 2])) * aspect;
        const dy = v - Number(pos[i * 2 + 1]);
        const w = Math.exp(-(dx * dx + dy * dy) / Number(sigma2[i]));
        L += w * Number(lab[i * 3]);
        a += w * Number(lab[i * 3 + 1]);
        b += w * Number(lab[i * 3 + 2]);
        wsum += w;
      }
      oklabToRgb(L / wsum, a / wsum, b / wsum, out, 0);
      const g = grainOffset(px, py, frame, seed, grain);
      out[0] = Number(out[0]) + g;
      out[1] = Number(out[1]) + g;
      out[2] = Number(out[2]) + g;
    },
  };
}
