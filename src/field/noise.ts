import { VisError } from "../core/index.js";
import { describeValue } from "../core/validate.js";

/**
 * Seeded 4-D simplex noise over a 32-bit integer hash. `glsl/common.ts` carries the
 * same algorithm in GLSL ES 3.0; keep the two in lock-step.
 *
 * Why an integer hash: a float hash (`fract(sin(x) * k)`) differs between JS
 * doubles and GLSL floats and is discontinuous, so a tiny input difference flips
 * the whole value. `Math.imul` with `>>> 0` here and `uint` arithmetic in GLSL are
 * bit-exact on both sides, and noise reaches the hash only at integer lattice
 * corners whose contribution vanishes at the cell boundary, so the remaining
 * float32-versus-float64 difference in the continuous maths stays tiny.
 *
 * Domain (these are hot kernels, so they document instead of re-checking):
 * - `hash4` takes INTEGER lattice coordinates and any integer seed. Each input is
 *   reduced modulo 2^32 (two's complement), exactly like a GLSL `uint(int)`, so
 *   negative and huge integers are defined. A fraction is truncated; callers
 *   build lattice points with `Math.floor` plus small integers, so none occurs.
 * - `simplex4` and `fbm` check their seed and a coordinate bound once per call
 *   (a few comparisons) and throw `VisError`.
 */

/** Largest |coordinate| a noise call accepts: keeps every lattice index inside int32. */
const COORD_LIMIT = 2 ** 28;
/** Octaves the GLSL loop unrolls to; the CPU path must stop at the same count. */
const MAX_OCTAVES = 5;

/** 32-bit integer hash of a lattice point and a seed. Bit-exact with the GLSL `hash4`. */
export function hash4(
  x: number,
  y: number,
  z: number,
  w: number,
  seed: number,
): number {
  let h =
    (Math.imul(x, 0x9e3779b1) ^
      Math.imul(y, 0x85ebca77) ^
      Math.imul(z, 0xc2b2ae3d) ^
      Math.imul(w, 0x27d4eb2f) ^
      seed) >>>
    0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** `hash4` mapped to [0, 1). */
export function hash01(
  x: number,
  y: number,
  z: number,
  w: number,
  seed: number,
): number {
  return hash4(x, y, z, w, seed) / 4294967296;
}

const F4 = 0.30901699437494745; // (sqrt(5) - 1) / 4
const G4 = 0.1381966011250105; // (5 - sqrt(5)) / 20

/**
 * Gradient of one lattice corner dotted with the offset (x, y, z, w). The 32
 * directions come from 5 hash bits exactly as the GLSL `grad4` does: bits 0..2 are
 * the signs of the three non-zero components (in axis order), bits 3..4 pick which
 * axis is zero. Computed, not looked up, so there is no table to keep in step.
 */
function gradDot(
  g: number,
  x: number,
  y: number,
  z: number,
  w: number,
): number {
  const a = g & 4 ? -1 : 1;
  const b = g & 2 ? -1 : 1;
  const c = g & 1 ? -1 : 1;
  const zero = g >>> 3;
  if (zero === 0) return a * y + b * z + c * w;
  if (zero === 1) return a * x + b * z + c * w;
  if (zero === 2) return a * x + b * y + c * w;
  return a * x + b * y + c * z;
}

function corner(
  x: number,
  y: number,
  z: number,
  w: number,
  i: number,
  j: number,
  k: number,
  l: number,
  seed: number,
): number {
  let t = 0.5 - x * x - y * y - z * z - w * w;
  if (t < 0) return 0;
  const g = hash4(i, j, k, l, seed) & 31;
  t *= t;
  return t * t * gradDot(g, x, y, z, w);
}

/** Unchecked kernel: `seed` is a uint32-safe integer, coordinates are inside the limit. */
function simplex(
  x: number,
  y: number,
  z: number,
  w: number,
  seed: number,
): number {
  const s = (x + y + z + w) * F4;
  const i = Math.floor(x + s);
  const j = Math.floor(y + s);
  const k = Math.floor(z + s);
  const l = Math.floor(w + s);
  const t = (i + j + k + l) * G4;
  const x0 = x - (i - t);
  const y0 = y - (j - t);
  const z0 = z - (k - t);
  const w0 = w - (l - t);
  // Rank of each offset among the four (3 = largest) fixes the traversal order.
  let rx = 0;
  let ry = 0;
  let rz = 0;
  let rw = 0;
  if (x0 > y0) rx++;
  else ry++;
  if (x0 > z0) rx++;
  else rz++;
  if (x0 > w0) rx++;
  else rw++;
  if (y0 > z0) ry++;
  else rz++;
  if (y0 > w0) ry++;
  else rw++;
  if (z0 > w0) rz++;
  else rw++;
  const i1 = rx >= 3 ? 1 : 0;
  const j1 = ry >= 3 ? 1 : 0;
  const k1 = rz >= 3 ? 1 : 0;
  const l1 = rw >= 3 ? 1 : 0;
  const i2 = rx >= 2 ? 1 : 0;
  const j2 = ry >= 2 ? 1 : 0;
  const k2 = rz >= 2 ? 1 : 0;
  const l2 = rw >= 2 ? 1 : 0;
  const i3 = rx >= 1 ? 1 : 0;
  const j3 = ry >= 1 ? 1 : 0;
  const k3 = rz >= 1 ? 1 : 0;
  const l3 = rw >= 1 ? 1 : 0;
  const n =
    corner(x0, y0, z0, w0, i, j, k, l, seed) +
    corner(
      x0 - i1 + G4,
      y0 - j1 + G4,
      z0 - k1 + G4,
      w0 - l1 + G4,
      i + i1,
      j + j1,
      k + k1,
      l + l1,
      seed,
    ) +
    corner(
      x0 - i2 + 2 * G4,
      y0 - j2 + 2 * G4,
      z0 - k2 + 2 * G4,
      w0 - l2 + 2 * G4,
      i + i2,
      j + j2,
      k + k2,
      l + l2,
      seed,
    ) +
    corner(
      x0 - i3 + 3 * G4,
      y0 - j3 + 3 * G4,
      z0 - k3 + 3 * G4,
      w0 - l3 + 3 * G4,
      i + i3,
      j + j3,
      k + k3,
      l + l3,
      seed,
    ) +
    corner(
      x0 - 1 + 4 * G4,
      y0 - 1 + 4 * G4,
      z0 - 1 + 4 * G4,
      w0 - 1 + 4 * G4,
      i + 1,
      j + 1,
      k + 1,
      l + 1,
      seed,
    );
  return 27 * n;
}

/** The seed as a uint32 (what the shader's `uint` holds); throws for a non-safe-integer. */
function noiseSeed(seed: number): number {
  if (!Number.isSafeInteger(seed))
    throw new VisError(
      `seed must be a safe integer, got ${describeValue(seed)}`,
    );
  return seed >>> 0;
}

/** `largest` is the biggest |coordinate| the kernel will see; NaN fails the comparison. */
function assertDomain(largest: number): void {
  if (!(largest <= COORD_LIMIT))
    throw new VisError(
      `noise coordinates must be finite numbers within ±${COORD_LIMIT}`,
    );
}

/**
 * 4-D simplex noise (rank-ordered corners, integer-hash gradients). Always inside [-1, 1];
 * with the 0.5 falloff radius and the 27 scale it peaks near +-0.43 and its rms is about 0.11.
 */
export function simplex4(
  x: number,
  y: number,
  z: number,
  w: number,
  seed: number,
): number {
  const s = noiseSeed(seed);
  assertDomain(Math.max(Math.abs(x), Math.abs(y), Math.abs(z), Math.abs(w)));
  return simplex(x, y, z, w, s);
}

/**
 * Fractal Brownian motion: 1..5 octaves, gain 0.5, lacunarity 2 on x and y only
 * (z and w are time), normalised to the raw noise range. Octave `o` uses seed + 101 * o
 * (wrapped to a uint32 like the shader).
 */
export function fbm(
  x: number,
  y: number,
  z: number,
  w: number,
  octaves: number,
  seed: number,
): number {
  if (!Number.isInteger(octaves) || octaves < 1 || octaves > MAX_OCTAVES)
    throw new VisError(
      `octaves must be an integer in 1..${MAX_OCTAVES}, got ${describeValue(octaves)}`,
    );
  const base = noiseSeed(seed);
  const top = 2 ** (octaves - 1);
  assertDomain(
    Math.max(Math.abs(x) * top, Math.abs(y) * top, Math.abs(z), Math.abs(w)),
  );
  let amp = 0.5;
  let f = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * simplex(x * f, y * f, z, w, (base + o * 101) >>> 0);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}
