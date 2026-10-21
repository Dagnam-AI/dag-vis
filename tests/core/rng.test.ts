import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/errors.js";
import { createRng } from "../../src/core/rng.js";

describe("createRng (mulberry32)", () => {
  it("is deterministic for a seed and differs across seeds", () => {
    const a = createRng(7);
    const b = createRng(7);
    const c = createRng(8);
    const seqA = [a.next(), a.next(), a.next()];
    expect(seqA).toEqual([b.next(), b.next(), b.next()]);
    expect(seqA).not.toEqual([c.next(), c.next(), c.next()]);
  });

  it("defaults to seed 1 and pins the first value", () => {
    expect(createRng().next()).toBe(createRng(1).next());
    expect(createRng(1).next()).toMatchInlineSnapshot(`0.6270739405881613`);
  });

  it("next() stays in [0, 1)", () => {
    const r = createRng(42);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("range() maps into [min, max)", () => {
    const r = createRng(3);
    for (let i = 0; i < 200; i++) {
      const v = r.range(-2, 5);
      expect(v).toBeGreaterThanOrEqual(-2);
      expect(v).toBeLessThan(5);
    }
  });

  it("int() is inclusive on both ends and hits them", () => {
    const r = createRng(5);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(r.int(1, 3));
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });

  it("pick() returns an element and throws VisError on an empty list", () => {
    const r = createRng(9);
    expect(["x", "y"]).toContain(r.pick(["x", "y"]));
    expect(() => r.pick([])).toThrow(VisError);
  });
});
