import { describe, expect, it } from "vitest";
import { VisError } from "../../src/core/index.js";
import { fbm, hash01, hash4, simplex4 } from "../../src/field/noise.js";

/** Independent hash: BigInt arithmetic, wrapped to 32 bits after every step. */
const U32 = (v: bigint): bigint => BigInt.asUintN(32, v);
function refHash(
  x: number,
  y: number,
  z: number,
  w: number,
  seed: number,
): number {
  const m = (c: number, k: bigint): bigint => U32(U32(BigInt(c)) * k);
  let h =
    m(x, 0x9e3779b1n) ^
    m(y, 0x85ebca77n) ^
    m(z, 0xc2b2ae3dn) ^
    m(w, 0x27d4eb2fn) ^
    U32(BigInt(seed));
  h = U32(U32(h ^ (h >> 16n)) * 0x7feb352dn);
  h = U32(U32(h ^ (h >> 15n)) * 0x846ca68bn);
  return Number(U32(h ^ (h >> 16n)));
}

/**
 * Independent simplex noise: corners found by sorting the axes by their offset
 * (largest first) and walking one axis step at a time, the textbook way, with
 * gradients picked from the same 32-entry rule through the reference hash.
 */
function refGradient(index: number): number[] {
  const signs = [index & 4 ? -1 : 1, index & 2 ? -1 : 1, index & 1 ? -1 : 1];
  const zeroAxis = Math.floor(index / 8);
  const g: number[] = [];
  let next = 0;
  for (let axis = 0; axis < 4; axis++)
    g.push(axis === zeroAxis ? 0 : signs[next++]!);
  return g;
}
function refSimplex(p: number[], seed: number): number {
  const F = (Math.sqrt(5) - 1) / 4;
  const G = (5 - Math.sqrt(5)) / 20;
  const skew = p.reduce((a, b) => a + b, 0) * F;
  const cell = p.map((v) => Math.floor(v + skew));
  const unskew = cell.reduce((a, b) => a + b, 0) * G;
  const d0 = p.map((v, i) => v - (cell[i]! - unskew));
  const order = [0, 1, 2, 3].sort((a, b) => d0[b]! - d0[a]! || a - b);
  const corners: number[][] = [[0, 0, 0, 0]];
  const walk = [0, 0, 0, 0];
  for (const axis of order.slice(0, 3)) {
    walk[axis] = 1;
    corners.push([...walk]);
  }
  corners.push([1, 1, 1, 1]);
  let n = 0;
  corners.forEach((c, step) => {
    const d = d0.map((v, i) => v - c[i]! + step * G);
    const t0 = 0.5 - d.reduce((a, b) => a + b * b, 0);
    if (t0 < 0) return;
    const [i, j, k, l] = cell.map((v, a) => v + c[a]!) as [
      number,
      number,
      number,
      number,
    ];
    const g = refGradient(refHash(i, j, k, l, seed) & 31);
    n += t0 ** 4 * g.reduce((a, b, a2) => a + b * d[a2]!, 0);
  });
  return 62 * n;
}

describe("hash4", () => {
  it("returns a uint32 for any integer input, including negatives", () => {
    for (const [x, y, z, w] of [
      [0, 0, 0, 0],
      [-5, 3, -2, 9],
      [2147483647, -2147483648, 1, 1],
    ] as const) {
      const h = hash4(x, y, z, w, 1);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(0xffffffff);
    }
  });
  it("is deterministic and seed-sensitive", () => {
    expect(hash4(1, 2, 3, 4, 7)).toBe(hash4(1, 2, 3, 4, 7));
    expect(hash4(1, 2, 3, 4, 7)).not.toBe(hash4(1, 2, 3, 4, 8));
    expect(hash4(1, 2, 3, 4, 7)).not.toBe(hash4(2, 2, 3, 4, 7));
  });
  it("hash01 is uniform-ish on [0,1)", () => {
    let sum = 0;
    for (let i = 0; i < 10000; i++) sum += hash01(i, i >> 3, 0, 0, 3);
    expect(sum / 10000).toBeGreaterThan(0.48);
    expect(sum / 10000).toBeLessThan(0.52);
    expect(hash01(0, 0, 0, 0, 0)).toBeLessThan(1);
  });
  it("seeds above 2^31 wrap like a GLSL uint (no NaN, no negative)", () => {
    expect(hash4(1, 1, 1, 1, 4294967295)).toBeGreaterThanOrEqual(0);
    expect(hash4(1, 1, 1, 1, 4294967295 + 404)).toBe(hash4(1, 1, 1, 1, 403));
    expect(hash4(1, 1, 1, 1, -1)).toBe(hash4(1, 1, 1, 1, 4294967295));
  });
  it("lattice coordinates wrap modulo 2^32 (negative and huge are defined)", () => {
    expect(hash4(2 ** 40 + 3, -(2 ** 33) - 4, 5, 6, 1)).toBe(
      hash4(3, -4, 5, 6, 1),
    );
    expect(hash4(-1, -1, -1, -1, 9)).toBe(
      hash4(4294967295, 4294967295, 4294967295, 4294967295, 9),
    );
  });
  it("matches a BigInt reference over negative, large and seed-edge inputs", () => {
    const seeds = [0, 1, 7, 403, 2147483648, 4294967295, 4294967296 + 5];
    const coords = [-2147483648, -100000, -7, -1, 0, 1, 2, 99, 2147483647];
    let checked = 0;
    for (const seed of seeds)
      for (const x of coords)
        for (const y of [-3, 0, 12345])
          for (const z of [-2147483648, 0, 77])
            for (const w of [-1, 0, 2147483647]) {
              expect(hash4(x, y, z, w, seed)).toBe(refHash(x, y, z, w, seed));
              checked++;
            }
    expect(checked).toBe(7 * 9 * 3 * 3 * 3);
  });
  it("pins known answers (computed with the BigInt reference)", () => {
    // With every input 0 the pre-mix value is 0 and the finaliser keeps it 0.
    expect(hash4(0, 0, 0, 0, 0)).toBe(0);
    expect(hash4(1, 0, 0, 0, 0)).toBe(1834104592);
    expect(hash4(1, 2, 3, 4, 7)).toBe(540339802);
    expect(hash4(-5, 3, -2, 9, 1)).toBe(3413628089);
    expect(hash4(0, 0, 0, 0, 1)).toBe(1753845952);
  });
});

describe("simplex4", () => {
  it("stays within [-1, 1] and is not constant", () => {
    let min = 1;
    let max = -1;
    for (let i = 0; i < 4000; i++) {
      const v = simplex4(i * 0.173, i * 0.071, i * 0.031, i * 0.013, 1);
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    expect(min).toBeGreaterThanOrEqual(-1);
    expect(max).toBeLessThanOrEqual(1);
    expect(max - min).toBeGreaterThan(0.8);
  });
  it("is continuous (small step → small change)", () => {
    for (let i = 0; i < 500; i++) {
      const x = i * 0.37;
      const a = simplex4(x, 0.5, 0.25, 0.125, 2);
      const b = simplex4(x + 1e-4, 0.5, 0.25, 0.125, 2);
      expect(Math.abs(a - b)).toBeLessThan(5e-3);
    }
  });
  it("depends on the seed and is deterministic", () => {
    expect(simplex4(0.3, 0.7, 0.1, 0.9, 1)).toBe(
      simplex4(0.3, 0.7, 0.1, 0.9, 1),
    );
    expect(simplex4(0.3, 0.7, 0.1, 0.9, 1)).not.toBe(
      simplex4(0.3, 0.7, 0.1, 0.9, 2),
    );
  });
  it("is finite for large in-range coordinates and extreme seeds", () => {
    expect(Number.isFinite(simplex4(0, 0, 0, 0, 0))).toBe(true);
    expect(Number.isFinite(simplex4(-1e6, 1e6, -1e5, 1e5, 4294967295))).toBe(
      true,
    );
  });
  it("matches an independent textbook implementation, negatives included", () => {
    let seen = 0;
    for (let i = 0; i < 1500; i++) {
      const p = [
        Math.sin(i * 1.7) * 40 - 5,
        Math.cos(i * 0.9) * 30,
        Math.sin(i * 0.31) * 9,
        Math.cos(i * 2.3) * 3,
      ] as [number, number, number, number];
      const seed = [0, 1, 7, 4294967295][i % 4]!;
      expect(simplex4(...p, seed)).toBeCloseTo(refSimplex(p, seed), 12);
      seen++;
    }
    expect(seen).toBe(1500);
  });
  it("pins known answers", () => {
    // Values from the independent implementation above, written down as literals
    // so a change to a constant or to the traversal shows up as a diff here.
    expect(simplex4(1.25, 2.5, 0.75, 0.5, 1)).toBeCloseTo(
      -0.32274016203386324,
      12,
    );
    expect(simplex4(0.5, 0.5, 0.5, 0.5, 0)).toBeCloseTo(
      0.18690969155928847,
      12,
    );
    expect(simplex4(2.1, 0.4, -1.3, 0.2, 7)).toBeCloseTo(
      -0.11290531742087263,
      12,
    );
    expect(simplex4(0, 0, 0, 0, 1)).toBe(0);
  });
  it("fills [-1, 1]: the peak is within [0.95, 1] and never exceeds 1", () => {
    let state = 12345;
    const next = (): number => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
    let peak = 0;
    for (let i = 0; i < 400000; i++)
      peak = Math.max(
        peak,
        Math.abs(
          simplex4(
            next() * 60 - 30,
            next() * 60 - 30,
            next() * 60 - 30,
            next() * 60 - 30,
            i % 8,
          ),
        ),
      );
    expect(peak).toBeGreaterThanOrEqual(0.95);
    expect(peak).toBeLessThanOrEqual(1);
  });
  it("rejects a seed that is not a safe integer, naming it", () => {
    for (const seed of [1.5, NaN, Infinity, 2 ** 53, "1" as unknown as number])
      expect(() => simplex4(0, 0, 0, 0, seed)).toThrow(VisError);
    expect(() => simplex4(0, 0, 0, 0, 1.5)).toThrow(/seed/);
  });
  it("rejects non-finite or out-of-range coordinates, naming them", () => {
    for (const bad of [NaN, Infinity, -Infinity, 2 ** 29, -(2 ** 29)]) {
      expect(() => simplex4(bad, 0, 0, 0, 1)).toThrow(/coordinates/);
      expect(() => simplex4(0, 0, 0, bad, 1)).toThrow(VisError);
    }
    expect(Number.isFinite(simplex4(2 ** 27, 0, 0, 0, 1))).toBe(true);
  });
});

describe("fbm", () => {
  it("one octave equals the raw noise and more octaves stay in range", () => {
    expect(fbm(0.2, 0.4, 0.1, 0, 1, 5)).toBeCloseTo(
      simplex4(0.2, 0.4, 0.1, 0, 5),
      12,
    );
    for (let i = 0; i < 500; i++) {
      const v = fbm(i * 0.11, i * 0.07, 0.3, 0.2, 5, 1);
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
    }
  });
  it("sums octaves with doubled frequency and seeds offset by 101", () => {
    const [x, y, z, w] = [0.37, -1.21, 0.5, 0.25];
    const expected =
      (0.5 * simplex4(x, y, z, w, 9) +
        0.25 * simplex4(x * 2, y * 2, z, w, 110) +
        0.125 * simplex4(x * 4, y * 4, z, w, 211)) /
      0.875;
    expect(fbm(x, y, z, w, 3, 9)).toBeCloseTo(expected, 12);
  });
  it("wraps the per-octave seed like a GLSL uint at the top of the range", () => {
    const expected =
      (0.5 * simplex4(0.4, 0.6, 0, 0, 4294967295) +
        0.25 * simplex4(0.8, 1.2, 0, 0, 100)) /
      0.75;
    expect(fbm(0.4, 0.6, 0, 0, 2, 4294967295)).toBeCloseTo(expected, 12);
  });
  it("accepts 1..5 octaves only (the shader loop is capped at 5)", () => {
    for (const o of [0, 6, 1.5, NaN, -1, "3" as unknown as number])
      expect(() => fbm(0, 0, 0, 0, o, 1)).toThrow(/octaves/);
    for (const o of [1, 2, 3, 4, 5])
      expect(Number.isFinite(fbm(0.1, 0.2, 0, 0, o, 1))).toBe(true);
  });
  it("validates the seed and the scaled coordinates once", () => {
    expect(() => fbm(0, 0, 0, 0, 2, 0.5)).toThrow(/seed/);
    expect(() => fbm(NaN, 0, 0, 0, 2, 1)).toThrow(/coordinates/);
    // 2^25 is fine at 1 octave but scales past the limit at 5 octaves.
    expect(Number.isFinite(fbm(2 ** 25, 0, 0, 0, 1, 1))).toBe(true);
    expect(() => fbm(2 ** 25, 0, 0, 0, 5, 1)).toThrow(/coordinates/);
  });
});
