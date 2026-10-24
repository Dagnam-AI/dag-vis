import { SHAPE_INDEX } from "../cpu/flow.js";
import { fluidDrift, fluidLab, fluidPositions } from "../cpu/fluid.js";
import { reedOffsets } from "../cpu/fluted.js";
import { assertPixelCount } from "../cpu/guards.js";
import { paletteLut } from "../lut.js";
import { rgbToOklab } from "../oklab.js";
import {
  MAX_FLUID_POINTS,
  MAX_REEDS,
  type ResolvedField,
  type ResolvedFlow,
  type ResolvedFluid,
} from "../spec.js";
import type { TimeCoords } from "../time.js";
import {
  GLSL_COMMON_UNIFORMS,
  GLSL_HASH,
  GLSL_HEADER,
  GLSL_LUT,
  GLSL_MAIN,
  GLSL_OKLAB,
  GLSL_SIMPLEX4,
} from "./common.js";
import { GLSL_FLOW } from "./flow.js";
import { GLSL_FLUID } from "./fluid.js";
import { GLSL_FLUTED } from "./fluted.js";

/**
 * One uniform: the GL call (`1i` is `uniform1i`, `2fv` is `uniform2fv`, and so on) and
 * its value. `1fv`, `2fv`, `3fv` and `4fv` take a `Float32Array` (a whole uniform array,
 * `vecN[]` for `Nfv`); the scalar and `Nf` forms take a number or a number array.
 */
export interface UniformValue {
  t: "1i" | "1f" | "1ui" | "2f" | "3f" | "4f" | "1fv" | "2fv" | "3fv" | "4fv";
  v: number | number[] | Float32Array;
}
export type Uniforms = Record<string, UniformValue>;

export interface GpuPlan {
  /** The complete GLSL ES 3.0 fragment shader (pair it with an attributeless fullscreen vertex shader). */
  fragment: string;
  /** The 256 x 3 float RGB ramp for the `uLut` texture (unit 0), or null for a program without one. */
  lut: Float32Array | null;
  /**
   * The uniforms for one frame of `width` x `height` whole pixels (the drawing buffer)
   * at the moment `tc`. The SAME record, value objects and arrays come back on every
   * call, updated in place, so a caller can keep references and the packer allocates
   * nothing per frame (the caller's `tc` aside): read or copy what you need before the
   * next call. Values that never change
   * (everything except the size, the time, the grain frame and the fluid points) are
   * set once.
   */
  uniforms(width: number, height: number, tc: TimeCoords): Uniforms;
}

const i = (v: number): UniformValue => ({ t: "1i", v });
const f = (v: number): UniformValue => ({ t: "1f", v });
const ui = (v: number): UniformValue => ({ t: "1ui", v });

/** What the sampler's own kind adds: its code, its ramp, its fixed uniforms and its per-frame step. */
interface Kind {
  glsl: string;
  lut: Float32Array | null;
  fixed: Uniforms;
  /** Writes the uniforms that depend on the moment, in place; absent when none do. */
  frame?: (tc: TimeCoords) => void;
}

function flowKind(spec: ResolvedFlow): Kind {
  const hl = spec.highlight;
  return {
    glsl: GLSL_FLOW,
    lut: paletteLut(spec.palette),
    fixed: {
      uShape: i(SHAPE_INDEX[spec.shape]),
      uOctaves: i(spec.warp.octaves),
      uStrength: f(spec.warp.strength),
      uWarpScale: f(spec.warp.scale),
      uScale: f(spec.scale),
      uRot: { t: "2f", v: [Math.cos(spec.rotation), Math.sin(spec.rotation)] },
      uVignette: f(spec.vignette),
      uHasHighlight: i(hl ? 1 : 0),
      uHighlight: {
        t: "4f",
        v: hl ? [hl.at[0], hl.at[1], hl.strength, hl.radius] : [0, 0, 0, 1],
      },
      uHighlightColor: {
        t: "3f",
        v: hl ? [hl.color.r, hl.color.g, hl.color.b] : [1, 1, 1],
      },
      uLut: i(0),
    },
  };
}

function fluidKind(spec: ResolvedFluid): Kind {
  const drift = fluidDrift(spec);
  const pos = new Float32Array(MAX_FLUID_POINTS * 2);
  const lab = new Float32Array(MAX_FLUID_POINTS * 3);
  lab.set(fluidLab(spec));
  const sigma = new Float32Array(MAX_FLUID_POINTS);
  spec.points.forEach((p, k) => {
    const s = spec.softness * p.spread;
    sigma[k] = 2 * s * s;
  });
  return {
    glsl: GLSL_FLUID,
    lut: null,
    fixed: {
      uCount: i(spec.points.length),
      uPos: { t: "2fv", v: pos },
      uLab: { t: "3fv", v: lab },
      uSigma: { t: "1fv", v: sigma },
      uBaseLab: {
        t: "3f",
        v: rgbToOklab(spec.base.r, spec.base.g, spec.base.b),
      },
    },
    // The shader never recomputes the drift: the CPU's positions are the only ones.
    frame: (tc) => {
      fluidPositions(spec, tc.theta, drift, pos);
    },
  };
}

/**
 * Assemble the fragment shader and the per-frame uniform packer for one resolved spec
 * (from `resolveField`). Uniform budget: the worst program (a fluted field over an
 * eight point fluid) counts 100 of the 224 uniform vectors GLSL ES 3.0 guarantees a
 * fragment shader, counting every scalar and every array element as a whole vector
 * (packing brings it lower).
 */
export function planGpu(spec: ResolvedField): GpuPlan {
  const flute = spec.kind === "fluted" ? spec : null;
  // The sampler that runs: the field itself, or the source a fluted field looks through.
  const source = flute ? flute.source : (spec as ResolvedFlow | ResolvedFluid);
  const kind = source.kind === "flow" ? flowKind(source) : fluidKind(source);

  const width = i(0);
  const height = i(0);
  const aspect = f(0);
  const grainFrame = i(0);
  const time: number[] = [0, 0];
  const uniforms: Uniforms = {
    uWidth: width,
    uHeight: height,
    uAspect: aspect,
    // The CPU's fluted sampler runs its source as is, so the noise (and the fluid drift)
    // hash with the source's seed, and only the grain with the fluted spec's own.
    uSeed: ui(source.seed),
    uGrainSeed: ui(spec.seed),
    uGrain: f(spec.grain),
    uGrainFrame: grainFrame,
    uTime: { t: "2f", v: time },
    ...kind.fixed,
  };
  if (flute) {
    const offsets = new Float32Array(MAX_REEDS);
    offsets.set(reedOffsets(flute));
    Object.assign(uniforms, {
      uReeds: i(flute.reeds),
      uVertical: i(flute.direction === "vertical" ? 1 : 0),
      uRefraction: f(flute.refraction),
      uShade: f(flute.shade),
      uOffsets: { t: "4fv", v: offsets },
    });
  }

  const head =
    GLSL_HEADER +
    GLSL_COMMON_UNIFORMS +
    GLSL_HASH +
    GLSL_SIMPLEX4 +
    GLSL_OKLAB +
    GLSL_LUT +
    kind.glsl;
  const color = source.kind === "flow" ? "flowColor" : "fluidColor";
  const fragment = flute
    ? `${head}\n#define SOURCE ${color}\n${GLSL_FLUTED}${GLSL_MAIN}`
    : `${head}\nvec3 fieldColor(vec2 uv) { return ${color}(uv); }\n${GLSL_MAIN}`;

  // Only the grain of the outermost spec is animated: a fluted source's grain is zero.
  const animatedGrain = spec.animatedGrain;
  return {
    fragment,
    lut: kind.lut,
    uniforms(w, h, tc) {
      assertPixelCount("width", w);
      assertPixelCount("height", h);
      width.v = w;
      height.v = h;
      aspect.v = w / h;
      // int32, as the shader's `int` is: the hash reads its bit pattern either way.
      grainFrame.v = animatedGrain ? tc.grainFrame | 0 : 0;
      time[0] = tc.z;
      time[1] = tc.w;
      kind.frame?.(tc);
      return uniforms;
    },
  };
}
