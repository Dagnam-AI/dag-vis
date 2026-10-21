import { describe, expect, it } from "vitest";

import { INTER, advance } from "../../src/brand/inter-metrics.js";

describe("Inter metrics", () => {
  it("covers ASCII, Latin-1 and the common punctuation at 2048 upem", () => {
    expect(INTER.unitsPerEm).toBe(2048);
    expect(INTER.regular.size).toBe(201);
    expect(INTER.bold.size).toBe(201);
    for (const cp of [
      32, 65, 126, 160, 255, 8211, 8212, 8216, 8217, 8218, 8220, 8221, 8222,
      8226, 8230,
    ]) {
      expect(INTER.regular.has(cp)).toBe(true);
      expect(INTER.bold.has(cp)).toBe(true);
    }
  });

  it("has a positive integer advance for every code point (table aligned with the code point list)", () => {
    for (const weight of ["regular", "bold"] as const) {
      for (const w of INTER[weight].values())
        expect(Number.isInteger(w) && w > 0).toBe(true);
    }
  });

  it("pins a few advances from the shipped TTFs", () => {
    expect(advance(32, "regular")).toBe(576); // space
    expect(advance(65, "regular")).toBe(1413); // A
    expect(advance(65, "bold")).toBe(1529);
    expect(advance(8230, "bold")).toBe(2052); // …
  });

  it("falls back to the average width for unknown code points", () => {
    expect(advance(0x4e2d, "regular")).toBe(INTER.fallback.regular);
    expect(advance(0x4e2d, "bold")).toBe(INTER.fallback.bold);
    expect(INTER.fallback.regular).toBeGreaterThan(1000);
  });
});
