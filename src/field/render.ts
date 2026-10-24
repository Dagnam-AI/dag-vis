import { VisError } from "../core/index.js";
import {
  MAX_DIMENSION,
  assertOptions,
  bounded,
  integerIn,
} from "../core/validate.js";
import { flowSampler } from "./cpu/flow.js";
import { fluidSampler } from "./cpu/fluid.js";
import { flutedSampler } from "./cpu/fluted.js";
import type { Sampler } from "./cpu/types.js";
import {
  resolveField,
  resolvedField,
  type FieldSpec,
  type ResolvedField,
} from "./spec.js";
import { timeCoords } from "./time.js";

/** One rendered frame: `data` is `width * height * 4` bytes, sRGB RGBA, row 0 on top. */
export interface Frame {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface RenderOptions {
  /** Whole pixels, 1..16384. */
  width: number;
  /** Whole pixels, 1..16384. `width * height` is at most `MAX_FRAME_PIXELS`. */
  height: number;
  /** Seconds, finite, within ±1000000; default 0. */
  t?: number;
  /** Loop period in seconds (positive, finite); frames at t and t + loop are byte-identical. */
  loop?: number;
}

/** Most pixels one frame may hold (2^25: an 8K frame fits): the check runs before anything is allocated. */
export const MAX_FRAME_PIXELS = 2 ** 25;

/** Largest |t| in seconds (about 11.6 days): keeps the noise's time coordinates well inside its domain. */
export const MAX_T = 1e6;

/** The sampler of `spec`'s kind, for a picture of `width` x `height` pixels. */
export function makeSampler(
  spec: ResolvedField,
  width: number,
  height: number,
): Sampler {
  switch (spec.kind) {
    case "flow":
      return flowSampler(spec, width, height);
    case "fluid":
      return fluidSampler(spec, width, height);
    case "fluted":
      return flutedSampler(spec, width, height);
  }
}

/**
 * Render one frame on the CPU: the reference every exporter and the GPU parity
 * check compare against.
 *
 * `spec` is a raw spec, validated on every call, or the exact object `resolveField`
 * returned (recognised by identity, never by its shape: a clone or a hand-built
 * object is validated as a raw spec, and fails). A resolved spec is rendered from the
 * copy `resolveField` took, so editing it afterwards changes nothing. Sizes are whole pixels for every kind
 * (a fluted field needs them to pick its reeds; the others are held to it so a frame
 * means the same thing whatever the kind). Throws a VisError naming the parameter.
 *
 * Pixel (x, y) is sampled at its centre, u = (x + 0.5) / width and
 * v = (y + 0.5) / height, with row 0 on top: the shader's `main` flips
 * `gl_FragCoord.y` to the same row index and takes the same centre, so a CPU and a GPU
 * pixel are the same pixel. Each channel is `round(c * 255)` (halves up) clamped to
 * 0..255 by the `Uint8ClampedArray` (grain can leave 0..1, and a NaN would store 0); alpha is
 * 255. The result is a pure function of the arguments, byte for byte.
 */
export function renderField(
  spec: FieldSpec | ResolvedField,
  opts: RenderOptions,
): Frame {
  assertOptions(opts);
  const width = integerIn("width", opts.width, 1, MAX_DIMENSION);
  const height = integerIn("height", opts.height, 1, MAX_DIMENSION);
  if (width * height > MAX_FRAME_PIXELS)
    throw new VisError(
      `width x height must be at most ${MAX_FRAME_PIXELS} pixels, got ${width} x ${height}`,
    );
  const t = opts.t === undefined ? 0 : bounded("t", opts.t, -MAX_T, MAX_T);
  const tc = timeCoords(t, opts.loop); // checks loop (type, finite, > 0) and names it
  const sampler = makeSampler(
    resolvedField(spec) ?? resolveField(spec),
    width,
    height,
  );
  sampler.prepare(tc);
  const data = new Uint8ClampedArray(width * height * 4);
  const out = new Float64Array(3);
  let i = 0;
  for (let y = 0; y < height; y++) {
    const v = (y + 0.5) / height;
    for (let x = 0; x < width; x++) {
      sampler.sample((x + 0.5) / width, v, x, y, out);
      data[i] = Math.round(Number(out[0]) * 255);
      data[i + 1] = Math.round(Number(out[1]) * 255);
      data[i + 2] = Math.round(Number(out[2]) * 255);
      data[i + 3] = 255;
      i += 4;
    }
  }
  return { data, width, height };
}
