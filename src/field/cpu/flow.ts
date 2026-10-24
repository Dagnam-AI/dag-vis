import { paletteLut, sampleLut } from "../lut.js";
import { fbm } from "../noise.js";
import type { FlowShape, ResolvedFlow } from "../spec.js";
import { grainOffset } from "./grain.js";
import { assertPositiveSize, uvError } from "./guards.js";
import type { Sampler } from "./types.js";

/** Shape to `uShape` in `GLSL_FLOW`: the order of `FLOW_SHAPES`. */
export const SHAPE_INDEX: Record<FlowShape, number> = {
  swirl: 0,
  wave: 1,
  aurora: 2,
  bloom: 3,
  band: 4,
  noise: 5,
};

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** GLSL `smoothstep` for e0 < e1. */
function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/**
 * The `flow` field on the CPU, one pixel at a time: a shaped, rotated, domain-warped
 * fbm mapped through the palette ramp, then highlight, vignette and grain. The maths
 * is the same, line for line, as `flowColor` in `GLSL_FLOW` plus the shared main; the
 * only difference is that the shader's `sinP`/`cosP` replace Math.sin/Math.cos (see there).
 * `spec` comes from `resolveField`; it is copied here, so later changes to it do not
 * reach the sampler. `width` and `height` set the aspect ratio of the picture.
 *
 * `u` and `v` are picture coordinates (0..1 across the picture, pixel centres). A
 * NaN, infinite or huge one throws a VisError naming `u` or `v`: the limit keeps the
 * noise coordinates inside the noise's range (about 7e7 divided by aspect x scale x
 * warp scale x 2^(octaves - 1)), which is far outside the picture for any normal
 * spec. `px` and `py` are integer pixel coordinates (see `grainOffset`).
 *
 * CPU against shader agreement (every channel within 2/255) holds for the shipped
 * presets and for the normal parameter ranges. It degrades as scale x aspect x warp
 * scale x warp strength x octaves grows, because float32 rounding of the coordinates
 * is amplified by the three nested warps. Measured on SwiftShader (headless
 * Chromium): at 16:9 and defaults every shape is within 0.011/255; the worst legal
 * settings reach about 4/255: swirl at 4:1, scale 10, warp strength 3, octaves 5 gave
 * 4.25/255, and aurora at 16:9, scale 10, warp scale 10, strength 3, octaves 5 gave
 * 3.01/255. A parity check that wants a guarantee should use presets or moderate
 * settings, or include one such extreme case and allow about 5/255 for it.
 */
export function flowSampler(
  spec: ResolvedFlow,
  width: number,
  height: number,
): Sampler {
  assertPositiveSize("width", width);
  assertPositiveSize("height", height);
  const lut = paletteLut(spec.palette);
  const aspect = width / height;
  const shape = SHAPE_INDEX[spec.shape];
  const { octaves, strength, scale: warpScale } = spec.warp;
  const { scale, vignette, seed, grain, animatedGrain } = spec;
  // |u|, |v| beyond this would push a noise coordinate past the noise's domain (2^28):
  // x is at most 1.8 x aspect x scale x warp scale x |u| (aurora), times 2^(octaves - 1)
  // inside fbm; the 2 leaves room for the warp offsets.
  const uvLimit =
    2 ** 27 /
    (2 * Math.max(aspect, 1) * scale * warpScale * 2 ** (octaves - 1));
  const cosR = Math.cos(spec.rotation);
  const sinR = Math.sin(spec.rotation);
  const hl = spec.highlight && {
    ax: spec.highlight.at[0],
    ay: spec.highlight.at[1],
    strength: spec.highlight.strength,
    radius: spec.highlight.radius,
    r: spec.highlight.color.r,
    g: spec.highlight.color.g,
    b: spec.highlight.color.b,
  };
  // Time state: copied scalars, so the caller's object is never kept.
  let tz = 0;
  let tw = 0;
  let frame = 0;

  /** iq-style domain warp, fbm(p + s fbm(p + s fbm(p))), mirrors the GLSL `warped`. */
  const warped = (x: number, y: number): number => {
    const qx = fbm(x, y, tz, tw, octaves, seed);
    const qy = fbm(x + 5.2, y + 1.3, tz, tw, octaves, seed);
    const rx = fbm(
      x + strength * qx + 1.7,
      y + strength * qy + 9.2,
      tz,
      tw,
      octaves,
      seed,
    );
    const ry = fbm(
      x + strength * qx + 8.3,
      y + strength * qy + 2.8,
      tz,
      tw,
      octaves,
      seed,
    );
    return fbm(x + strength * rx, y + strength * ry, tz, tw, octaves, seed);
  };

  return {
    prepare(tc) {
      tz = tc.z;
      tw = tc.w;
      frame = animatedGrain ? tc.grainFrame : 0;
    },
    sample(u, v, px, py, out) {
      // `!(<=)` so NaN fails too.
      if (!(Math.abs(u) <= uvLimit)) uvError("u", u, uvLimit);
      if (!(Math.abs(v) <= uvLimit)) uvError("v", v, uvLimit);
      let x = (u - 0.5) * aspect * scale;
      let y = (v - 0.5) * scale;
      const rx = x * cosR - y * sinR;
      y = x * sinR + y * cosR;
      x = rx;
      const x0 = x;
      const y0 = y;
      if (shape === 0) {
        const a = 1.5 * Math.sqrt(x * x + y * y);
        const c = Math.cos(a);
        const s = Math.sin(a);
        const sx = x * c - y * s;
        y = x * s + y * c;
        x = sx;
      } else if (shape === 1) {
        y += 0.35 * Math.sin(x * 2);
      } else if (shape === 2) {
        x *= 1.8;
        y *= 0.45;
      }
      const n = warped(x * warpScale, y * warpScale);
      let val: number;
      if (shape === 4) {
        val = 0.5 + 0.5 * Math.sin((y + 0.6 * n) * 3);
      } else if (shape === 3) {
        const r = clamp01(Math.sqrt(x0 * x0 + y0 * y0) * 0.9);
        val = (0.5 + 0.8 * n) * 0.45 + (1 - r) * 0.55;
      } else {
        val = 0.5 + 0.8 * n;
      }
      sampleLut(lut, clamp01(val), out);
      let r = Number(out[0]);
      let g = Number(out[1]);
      let b = Number(out[2]);
      if (hl) {
        const dx = (u - hl.ax) * aspect;
        const dy = v - hl.ay;
        const k = 1 - smoothstep(0, hl.radius, Math.sqrt(dx * dx + dy * dy));
        const h = hl.strength * k * k;
        r = r * (1 - h) + hl.r * h;
        g = g * (1 - h) + hl.g * h;
        b = b * (1 - h) + hl.b * h;
      }
      const vx = (u - 0.5) * aspect;
      const vy = v - 0.5;
      const vg =
        1 -
        vignette * smoothstep(0.35, 0.95, Math.sqrt(vx * vx + vy * vy) * 1.2);
      const gr = grainOffset(px, py, frame, seed, grain);
      out[0] = r * vg + gr;
      out[1] = g * vg + gr;
      out[2] = b * vg + gr;
    },
  };
}
