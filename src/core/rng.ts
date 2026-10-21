import { VisError } from "./errors.js";

/** Seeded PRNG. Every generator draws its randomness from here, never Math.random. */
export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform in [min, max). */
  range(min: number, max: number): number;
  /** Uniform integer in [min, maxInclusive]. */
  int(min: number, maxInclusive: number): number;
  pick<T>(items: readonly T[]): T;
}

/** mulberry32 — tiny, fast, and identical in every JS engine. */
export function createRng(seed = 1): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, maxInclusive) =>
      min + Math.floor(next() * (maxInclusive - min + 1)),
    pick<T>(items: readonly T[]): T {
      if (items.length === 0)
        throw new VisError("pick() needs a non-empty list");
      return items[Math.floor(next() * items.length)] as T;
    },
  };
}
