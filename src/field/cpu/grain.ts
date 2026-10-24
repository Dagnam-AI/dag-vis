import { hash01 } from "../noise.js";

/**
 * Tag hashed with the pixel, in `GLSL_MAIN` too: keeps the grain in its own hash
 * stream, apart from the lattice hashes of the noise.
 */
const GRAIN_TAG = 0x9e37;

/**
 * Monochrome per-pixel grain offset, identical to the GLSL `main`:
 * `(hash01(px, py, frame, 0x9E37, seed) - 0.5) * amount * 0.35`, so it lies in
 * +-0.175 * amount and has mean 0.
 *
 * It is a pure function of five integers. `px` and `py` are the integer pixel
 * coordinates (top row 0), `frame` is the integer grain frame (`TimeCoords.grainFrame`
 * for animated grain, 0 for still grain) and `seed` is the field's seed. The hash
 * reduces every input modulo 2^32 (two's complement), exactly like the shader's
 * `uint(int)`, so a negative or huge integer cannot make the two sides diverge; the
 * host passes `grainFrame | 0` to the shader's `int` uniform. A fraction would be
 * truncated here and not on the GPU, so callers pass integers.
 */
export function grainOffset(
  px: number,
  py: number,
  frame: number,
  seed: number,
  amount: number,
): number {
  if (amount === 0) return 0;
  return (hash01(px, py, frame, GRAIN_TAG, seed) - 0.5) * amount * 0.35;
}
