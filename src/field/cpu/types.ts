import type { TimeCoords } from "../time.js";

/**
 * One field kind on the CPU. `prepare` runs once per frame; `sample` runs once per
 * pixel and writes sRGB 0..1 into `out[0..2]` (not clamped: the
 * renderer clamps when it quantises). `sample` is a pure function of the last
 * prepared time and its own arguments, and it allocates nothing.
 */
export interface Sampler {
  prepare(tc: TimeCoords): void;
  sample(u: number, v: number, px: number, py: number, out: Float64Array): void;
}
